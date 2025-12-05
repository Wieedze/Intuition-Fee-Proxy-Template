# Intuition Fee Proxy

A customizable proxy contract for the [Intuition](https://intuition.systems) MultiVault that allows you to collect fees on atom/triple creation and deposits.

## Features

- **Creation fees**: Fixed fee per atom or triple created
- **Deposit fees**: Fixed fee + percentage fee on deposits
- **Admin system**: Whitelisted admins can update fees and settings
- **Receiver pattern**: Shares are deposited directly to users (requires approval)
- **Full MultiVault compatibility**: All view functions pass through to MultiVault

## Prerequisites

- Node.js >= 18
- npm or yarn
- A wallet with TRUST tokens for deployment

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/YOUR_USERNAME/intuition-fee-proxy.git
cd intuition-fee-proxy
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Deployer private key (with TRUST tokens)
PRIVATE_KEY=0x...

# Fee recipient address (receives all collected fees)
# IMPORTANT: Use an address on Intuition Network, NOT another chain
FEE_RECIPIENT=0x...

# Admin addresses (can modify fees and settings)
ADMIN_1=0x...
ADMIN_2=0x...  # Optional

# Fee configuration
CREATION_FEE=0.1        # Fixed fee per atom/triple (in TRUST)
DEPOSIT_FEE=0           # Fixed fee per deposit (in TRUST)
DEPOSIT_PERCENTAGE=500  # Percentage fee (500 = 5%, base 10000)
```

### 3. Compile and Test

```bash
npm run compile
npm test
```

### 4. Deploy

**Testnet (recommended first):**
```bash
npx hardhat run scripts/deploy.ts --network intuition-testnet
```

**Mainnet:**
```bash
npx hardhat run scripts/deploy.ts --network intuition
```

## Configuration

### Fee Structure

| Parameter | Description | Example |
|-----------|-------------|---------|
| `creationFixedFee` | Fixed fee per atom/triple creation | 0.1 TRUST |
| `depositFixedFee` | Fixed fee per deposit | 0 TRUST |
| `depositPercentageFee` | Percentage of deposit amount | 500 (5%) |

### Fee Calculation

- **Creation**: `fee = creationFixedFee * count`
- **Deposit**: `fee = depositFixedFee + (amount * depositPercentageFee / 10000)`

### Example

For a user depositing 10 TRUST with default config (0 fixed, 5% percentage):
- Fee = 0 + (10 * 500 / 10000) = 0.5 TRUST
- User sends: 10.5 TRUST
- MultiVault receives: 10 TRUST
- Fee recipient receives: 0.5 TRUST

## User Approval Flow

Users must approve the proxy on MultiVault before using it:

```solidity
// User calls this once on MultiVault
multiVault.approve(proxyAddress, 1); // 1 = DEPOSIT approval
```

This allows the proxy to deposit shares on behalf of the user.

## Contract Functions

### User Functions

```solidity
// Create atoms with fee
createAtoms(receiver, data[], assets[], curveId) payable

// Create triples with fee
createTriples(receiver, subjectIds[], predicateIds[], objectIds[], assets[], curveId) payable

// Deposit with fee
deposit(receiver, termId, curveId, minShares) payable

// Batch deposit with fee
depositBatch(receiver, termIds[], curveIds[], assets[], minShares[]) payable
```

### Admin Functions

```solidity
setCreationFixedFee(newFee)
setDepositFixedFee(newFee)
setDepositPercentageFee(newFee)
setFeeRecipient(newRecipient)
setWhitelistedAdmin(admin, status)
```

### View Functions

```solidity
calculateCreationFee(count)
calculateDepositFee(amount)
getTotalCreationCost(count, multiVaultCost)
getTotalDepositCost(depositAmount)
getMultiVaultAmountFromValue(msgValue)
```

## Network Configuration

| Network | Chain ID | MultiVault Address |
|---------|----------|-------------------|
| Intuition Mainnet | 1155 | `0x6E35cF57A41fA15eA0EaE9C33e751b01A784Fe7e` |
| Intuition Testnet | 13579 | `0x2Ece8D4dEdcB9918A398528f3fa4688b1d2CAB91` |

## Frontend Integration

```typescript
// Calculate total cost for a deposit
const depositAmount = parseEther("10");
const totalCost = await proxy.getTotalDepositCost(depositAmount);

// Send transaction
await proxy.deposit(userAddress, termId, curveId, 0, { value: totalCost });
```

## Security Considerations

1. **Fee recipient chain**: Ensure `FEE_RECIPIENT` is an address you control on Intuition Network
2. **Admin keys**: Securely store admin private keys
3. **Fee limits**: Consider implementing maximum fee limits for user trust
4. **Upgrades**: This contract is not upgradeable - deploy a new version if needed

## License

MIT
