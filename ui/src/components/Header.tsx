import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-left">
            <div className="brand-mark">10x10</div>
            <div>
              <h1 className="header-title">PrivacyCanvas</h1>
              <p className="header-subtitle">Encrypted pixel sketches on Sepolia.</p>
            </div>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
