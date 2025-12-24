import { useCallback, useMemo, useState, useEffect } from 'react';
import { Contract, ZeroHash } from 'ethers';
import { useAccount, usePublicClient } from 'wagmi';
import { Header } from './Header';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import '../styles/CanvasApp.css';

const GRID_SIZE = 10;
const CELL_COUNT = GRID_SIZE * GRID_SIZE;
// const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const cellIds = Array.from({ length: CELL_COUNT }, (_, index) => index + 1);

function maskFromIds(ids: number[]) {
  return ids.reduce((mask, id) => mask | (1n << BigInt(id - 1)), 0n);
}

function idsFromMask(mask: bigint) {
  const ids: number[] = [];
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (((mask >> BigInt(index)) & 1n) === 1n) {
      ids.push(index + 1);
    }
  }
  return ids;
}

type CanvasGridProps = {
  activeIds: number[];
  interactive?: boolean;
  onToggle?: (id: number) => void;
  variant?: 'draw' | 'decrypted';
};

function CanvasGrid({ activeIds, interactive = false, onToggle, variant = 'draw' }: CanvasGridProps) {
  return (
    <div className={`canvas-grid ${variant}`}>
      {cellIds.map((id) => {
        const isActive = activeIds.includes(id);
        const className = `canvas-cell ${isActive ? 'active' : 'inactive'}`;
        return interactive ? (
          <button
            key={id}
            type="button"
            className={className}
            onClick={() => onToggle?.(id)}
            aria-pressed={isActive}
            aria-label={`Cell ${id}`}
          />
        ) : (
          <div key={id} className={className} aria-hidden="true" />
        );
      })}
    </div>
  );
}

export function CanvasApp() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [encryptedCanvas, setEncryptedCanvas] = useState<string | null>(null);
  const [hasOnChainCanvas, setHasOnChainCanvas] = useState<boolean | null>(null);
  const [decryptedIds, setDecryptedIds] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [refreshIndex, setRefreshIndex] = useState(0);

  const selectedMask = useMemo(() => maskFromIds(selectedIds), [selectedIds]);
  const sortedSelectedIds = useMemo(() => [...selectedIds].sort((a, b) => a - b), [selectedIds]);
  const isContractReady = true;
  const onChainStatus = !isConnected
    ? 'Disconnected'
    : hasOnChainCanvas === null
      ? 'Checking'
      : hasOnChainCanvas
        ? 'Saved'
        : 'Empty';

  const toggleCell = (id: number) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((value) => value !== id);
      }
      return [...prev, id];
    });
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  const refreshOnChain = useCallback(async () => {
    if (!address || !publicClient || !isContractReady) {
      setEncryptedCanvas(null);
      setHasOnChainCanvas(null);
      return;
    }

    try {
      const contractAddress = CONTRACT_ADDRESS as `0x${string}`;
      const accountAddress = address as `0x${string}`;
      const [hasCanvas, canvas] = await Promise.all([
        publicClient.readContract({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'hasCanvas',
          args: [accountAddress],
        }),
        publicClient.readContract({
          address: contractAddress,
          abi: CONTRACT_ABI,
          functionName: 'getCanvas',
          args: [accountAddress],
        }),
      ]);

      setHasOnChainCanvas(Boolean(hasCanvas));
      setEncryptedCanvas(canvas as string);
    } catch (error) {
      console.error('Failed to read canvas:', error);
      setStatusMessage('Unable to read your canvas. Check the network and address.');
    }
  }, [address, publicClient, isContractReady]);

  useEffect(() => {
    refreshOnChain();
  }, [refreshOnChain, refreshIndex]);

  const saveCanvas = async () => {
    if (!isConnected || !address) {
      setStatusMessage('Connect your wallet to save the canvas.');
      return;
    }
    if (!instance || !signerPromise) {
      setStatusMessage('Encryption service is still loading.');
      return;
    }
    if (!isContractReady) {
      setStatusMessage('Set the PrivacyCanvas contract address before saving.');
      return;
    }

    setIsSaving(true);
    setStatusMessage('');

    try {
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add128(selectedMask);
      const encryptedInput = await input.encrypt();

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available.');
      }

      const contract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.saveCanvas(encryptedInput.handles[0], encryptedInput.inputProof);
      setStatusMessage('Transaction sent. Waiting for confirmation...');
      await tx.wait();

      setStatusMessage('Canvas saved on-chain.');
      setRefreshIndex((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to save canvas:', error);
      setStatusMessage('Failed to save the canvas. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const decryptCanvas = async () => {
    if (!isConnected || !address) {
      setStatusMessage('Connect your wallet to decrypt.');
      return;
    }
    if (!instance || !signerPromise) {
      setStatusMessage('Encryption service is still loading.');
      return;
    }
    if (!encryptedCanvas || encryptedCanvas === ZeroHash) {
      setDecryptedIds([]);
      setStatusMessage('No canvas stored for this address.');
      return;
    }
    if (!isContractReady) {
      setStatusMessage('Set the PrivacyCanvas contract address before decrypting.');
      return;
    }

    setIsDecrypting(true);
    setStatusMessage('');

    try {
      const keypair = instance.generateKeypair();
      const handleContractPairs = [
        {
          handle: encryptedCanvas,
          contractAddress: CONTRACT_ADDRESS,
        },
      ];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '10';
      const contractAddresses = [CONTRACT_ADDRESS];
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);

      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer not available.');
      }

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decryptedMask = result[encryptedCanvas as string] ?? '0';
      const decodedIds = idsFromMask(BigInt(decryptedMask));
      setDecryptedIds(decodedIds);
      setStatusMessage('Canvas decrypted locally.');
    } catch (error) {
      console.error('Failed to decrypt canvas:', error);
      setStatusMessage('Failed to decrypt the canvas.');
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <div className="canvas-app">
      <Header />
      <main className="canvas-main">
        <section className="hero reveal" style={{ animationDelay: '0.05s' }}>
          <div className="hero-text">
            <p className="eyebrow">Encrypted art space</p>
            <h2 className="hero-title">Sketch on a 10x10 grid, encrypt every pixel, and keep it private.</h2>
            <p className="hero-subtitle">
              Select cells, encrypt the mask with Zama, then save the ciphertext on-chain. Decrypt on demand to reveal
              the exact pattern you drew.
            </p>
          </div>
          <div className="hero-panel">
            <div className="stat-row">
              <span>Selected cells</span>
              <strong>{selectedIds.length}</strong>
            </div>
            <div className="stat-row">
              <span>On-chain status</span>
              <strong>{onChainStatus}</strong>
            </div>
            <div className="stat-row">
              <span>Encryption</span>
              <strong>{zamaLoading ? 'Loading' : 'Ready'}</strong>
            </div>
            <div className="status-badge">
              {isContractReady ? 'Sepolia contract connected' : 'Update contract address to enable actions'}
            </div>
          </div>
        </section>

        <section className="workbench">
          <div className="card reveal" style={{ animationDelay: '0.1s' }}>
            <div className="card-header">
              <div>
                <h3>Draw canvas</h3>
                <p>Tap cells to toggle them on your private grid.</p>
              </div>
              <div className="button-row">
                <button type="button" className="ghost-button" onClick={clearSelection}>
                  Clear
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={saveCanvas}
                  disabled={isSaving || zamaLoading}
                >
                  {isSaving ? 'Encrypting...' : 'Encrypt & Save'}
                </button>
              </div>
            </div>

            <div className="grid-wrapper">
              <CanvasGrid activeIds={selectedIds} interactive onToggle={toggleCell} variant="draw" />
            </div>

            <div className="selection-meta">
              <span className="meta-label">Selected ids</span>
              <span className="meta-value">
                {sortedSelectedIds.length ? sortedSelectedIds.join(', ') : 'None'}
              </span>
            </div>
            <div className="selection-meta">
              <span className="meta-label">Mask preview</span>
              <span className="meta-value mono">{`0x${selectedMask.toString(16)}`}</span>
            </div>
          </div>

          <div className="card reveal" style={{ animationDelay: '0.15s' }}>
            <div className="card-header">
              <div>
                <h3>Your on-chain canvas</h3>
                <p>Load your encrypted mask and decrypt it locally.</p>
              </div>
              <div className="button-row">
                <button type="button" className="ghost-button" onClick={() => setRefreshIndex((prev) => prev + 1)}>
                  Refresh
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={decryptCanvas}
                  disabled={isDecrypting || zamaLoading}
                >
                  {isDecrypting ? 'Decrypting...' : 'Decrypt'}
                </button>
              </div>
            </div>

            <div className="grid-wrapper">
              <CanvasGrid activeIds={decryptedIds} variant="decrypted" />
            </div>

            <div className="selection-meta">
              <span className="meta-label">Encrypted handle</span>
              <span className="meta-value mono">
                {encryptedCanvas ? encryptedCanvas : 'No encrypted canvas loaded'}
              </span>
            </div>
            <div className="selection-meta">
              <span className="meta-label">Decrypted ids</span>
              <span className="meta-value">
                {decryptedIds.length ? decryptedIds.join(', ') : 'None'}
              </span>
            </div>
          </div>
        </section>

        {(statusMessage || zamaError) && (
          <section className="status-panel reveal" style={{ animationDelay: '0.2s' }}>
            {zamaError && <p className="status-error">{zamaError}</p>}
            {statusMessage && <p className="status-info">{statusMessage}</p>}
          </section>
        )}
      </main>
    </div>
  );
}
