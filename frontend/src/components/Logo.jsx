import { Link } from 'react-router-dom';

export function LogoMark({ className = '' }) {
  return (
    <svg className={className} viewBox="500 490 945 495" aria-hidden="true">
      <defs>
        <linearGradient id="gahGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe08a" />
          <stop offset=".5" stopColor="#f2b92f" />
          <stop offset="1" stopColor="#c98a12" />
        </linearGradient>
      </defs>
      <g fill="url(#gahGold)">
        <path d="M508 975 970 500 1437 975H1250V935H1335L970 562 607 935H697V975Z" />
        <path d="M800 690H840V935H1095V690H1135V975H800Z" />
        <rect x="975" y="720" width="60" height="60" />
        <rect x="887" y="800" width="68" height="66" />
      </g>
    </svg>
  );
}

export default function Logo({ stacked = false }) {
  return (
    <Link to="/" className={`logo ${stacked ? 'logo--stacked' : ''}`} aria-label="Gadget Accessories Home">
      <LogoMark className="logo__mark" />
      <span className="logo__text">
        Gadget <span className="gold">Accessories</span> Home
      </span>
    </Link>
  );
}
