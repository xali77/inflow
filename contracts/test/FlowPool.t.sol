// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {FlowPool} from "../src/FlowPool.sol";

contract MockUSDC {
    string public constant name = "Mock USDC";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "balance");
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract FlowPoolTest is Test {
    bytes32 private constant LOAN_TYPEHASH = keccak256(
        "Loan(address receiver,address sender,uint256 principal,uint256 collateral,uint256 interest,uint64 dueDate,bytes32 nonce,uint64 expiry)"
    );

    uint256 private constant USDC = 1e6;

    MockUSDC private usdc;
    FlowPool private pool;

    uint256 private signerKey = 0xA11CE;
    address private termsSigner = vm.addr(signerKey);
    address private treasury = address(0xBEEF);
    address private lp = address(0x1111);
    address private sender = address(0x2222);
    address private receiver = address(0x3333);

    function setUp() public {
        usdc = new MockUSDC();
        pool = new FlowPool(address(usdc), termsSigner, treasury, 1000);

        usdc.mint(lp, 10_000 * USDC);
        usdc.mint(sender, 10_000 * USDC);
        usdc.mint(receiver, 10_000 * USDC);

        vm.prank(lp);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(sender);
        usdc.approve(address(pool), type(uint256).max);
        vm.prank(receiver);
        usdc.approve(address(pool), type(uint256).max);
    }

    function testDepositAndWithdrawShares() public {
        vm.prank(lp);
        uint256 shares = pool.deposit(1_000 * USDC);

        assertEq(shares, 1_000 * USDC);
        assertEq(pool.totalAssets(), 1_000 * USDC);
        assertEq(pool.liquidity(), 1_000 * USDC);
        assertEq(pool.sharesOf(lp), 1_000 * USDC);

        vm.prank(lp);
        uint256 amount = pool.withdraw(400 * USDC);

        assertEq(amount, 400 * USDC);
        assertEq(pool.totalAssets(), 600 * USDC);
        assertEq(pool.liquidity(), 600 * USDC);
        assertEq(pool.sharesOf(lp), 600 * USDC);
    }

    function testFundAndRepayLoan() public {
        _deposit(1_000 * USDC);

        FlowPool.LoanParams memory p = _loanParams(100 * USDC, 50 * USDC, 10 * USDC);
        bytes memory sig = _sign(p);
        uint256 receiverBefore = usdc.balanceOf(receiver);

        vm.prank(sender);
        uint256 id = pool.fundLoan(p, sig);

        assertEq(id, 0);
        assertEq(usdc.balanceOf(receiver), receiverBefore + 100 * USDC);
        assertEq(pool.liquidity(), 900 * USDC);
        assertEq(pool.outstandingPrincipal(), 100 * USDC);
        assertEq(pool.collateralHeld(), 50 * USDC);

        vm.prank(receiver);
        pool.repay(id);

        assertEq(pool.liquidity(), 1_009 * USDC);
        assertEq(pool.totalAssets(), 1_009 * USDC);
        assertEq(pool.outstandingPrincipal(), 0);
        assertEq(pool.collateralHeld(), 0);
        assertEq(pool.feesCollected(), 1 * USDC);
        assertEq(usdc.balanceOf(treasury), 1 * USDC);

        (,,,,,, FlowPool.Status status) = pool.loans(id);
        assertEq(uint8(status), uint8(FlowPool.Status.Repaid));
    }

    function testLiquidationSeizesCollateralAndWritesOffUncoveredPrincipal() public {
        _deposit(1_000 * USDC);

        FlowPool.LoanParams memory p = _loanParams(100 * USDC, 50 * USDC, 10 * USDC);
        bytes memory sig = _sign(p);

        vm.prank(sender);
        uint256 id = pool.fundLoan(p, sig);

        vm.warp(uint256(p.dueDate) + 1);
        pool.liquidate(id);

        assertEq(pool.liquidity(), 950 * USDC);
        assertEq(pool.totalAssets(), 950 * USDC);
        assertEq(pool.outstandingPrincipal(), 0);
        assertEq(pool.collateralHeld(), 0);

        (,,,,,, FlowPool.Status status) = pool.loans(id);
        assertEq(uint8(status), uint8(FlowPool.Status.Defaulted));
    }

    function testRejectsPastDueLoanEvenWithValidSignature() public {
        _deposit(1_000 * USDC);

        FlowPool.LoanParams memory p = _loanParams(100 * USDC, 50 * USDC, 10 * USDC);
        p.dueDate = uint64(block.timestamp);
        p.nonce = keccak256("past-due");
        bytes memory sig = _sign(p);

        vm.expectRevert("bad due date");
        vm.prank(sender);
        pool.fundLoan(p, sig);
    }

    function testRejectsBadSigner() public {
        _deposit(1_000 * USDC);

        FlowPool.LoanParams memory p = _loanParams(100 * USDC, 50 * USDC, 10 * USDC);
        bytes memory sig = _signWith(0xB0B, p);

        vm.expectRevert("bad signature");
        vm.prank(sender);
        pool.fundLoan(p, sig);
    }

    function _deposit(uint256 amount) private {
        vm.prank(lp);
        pool.deposit(amount);
    }

    function _loanParams(uint256 principal, uint256 collateral, uint256 interest)
        private
        view
        returns (FlowPool.LoanParams memory)
    {
        return FlowPool.LoanParams({
            receiver: receiver,
            sender: sender,
            principal: principal,
            collateral: collateral,
            interest: interest,
            dueDate: uint64(block.timestamp + 30 days),
            nonce: keccak256(abi.encode(block.timestamp, principal, collateral, interest)),
            expiry: uint64(block.timestamp + 1 hours)
        });
    }

    function _sign(FlowPool.LoanParams memory p) private view returns (bytes memory) {
        return _signWith(signerKey, p);
    }

    function _signWith(uint256 key, FlowPool.LoanParams memory p) private view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                LOAN_TYPEHASH, p.receiver, p.sender, p.principal, p.collateral, p.interest, p.dueDate, p.nonce, p.expiry
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", pool.DOMAIN_SEPARATOR(), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
