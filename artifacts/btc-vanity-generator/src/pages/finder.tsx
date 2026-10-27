import { useState } from "react";
import { searchHDAddresses } from "@/lib/bitcoin";

export default function FinderPage() {
  const [xpub, setXpub] = useState("");
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(1000);
  const [target, setTarget] = useState("1BgGZ9tcN4rm9KBzDn7KprQz87SZ26SAMH"); // مثال
  const [status, setStatus] = useState("Ready");
  const [speed, setSpeed] = useState(0);
  const [found, setFound] = useState<any>(null);

  async function handleSearch() {
    setStatus("Searching...");
    setFound(null);
    setSpeed(0);

    try {
      await searchHDAddresses(
        xpub,
        startIndex,
        endIndex,
        target,
        "legacy",
        (index, currentAddress, currentSpeed) => {
          setStatus(`Searching Index: ${index} (${currentAddress})`);
          setSpeed(currentSpeed);
        },
        (result) => {
          setFound(result);
        }
      );
      setStatus((prev) => prev.includes("Searching") ? "Finished (Not Found)" : prev);
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  }

  return (
    <div style={{ padding: "20px", color: "white" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>BIP32 HD Finder</h1>
      
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "500px" }}>
        <input 
          type="text" 
          value={xpub} 
          onChange={(e) => setXpub(e.target.value)} 
          placeholder="xpub... (or xprv)" 
          style={{ padding: "10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "5px", color: "white" }}
        />
        <div style={{ display: "flex", gap: "10px" }}>
          <input 
            type="number" 
            value={startIndex} 
            onChange={(e) => setStartIndex(Number(e.target.value))} 
            placeholder="Start Index" 
            style={{ padding: "10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "5px", color: "white", width: "50%" }}
          />
          <input 
            type="number" 
            value={endIndex} 
            onChange={(e) => setEndIndex(Number(e.target.value))} 
            placeholder="End Index" 
            style={{ padding: "10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "5px", color: "white", width: "50%" }}
          />
        </div>
        <input 
          type="text" 
          value={target} 
          onChange={(e) => setTarget(e.target.value)} 
          placeholder="Target Address" 
          style={{ padding: "10px", background: "#1a1a1a", border: "1px solid #333", borderRadius: "5px", color: "white" }}
        />
        <button 
          onClick={handleSearch}
          style={{ padding: "10px", background: "#22c55e", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold" }}
        >
          Start HD Search
        </button>
      </div>

      <div style={{ marginTop: "20px" }}>
        <p>Status: <span style={{ color: "#eab308" }}>{status}</span></p>
        <p>Speed: <span style={{ color: "#22c55e" }}>{speed.toLocaleString()} keys/sec</span></p>
      </div>

      {found && (
        <div style={{ marginTop: "20px", background: "#064e3b", border: "1px solid #22c55e", padding: "15px", borderRadius: "5px" }}>
          <h2 style={{ color: "#4ade80", marginBottom: "10px" }}>✅ FOUND at Index {found.index}!</h2>
          <p><strong>Address:</strong> {found.address}</p>
          {found.privateKeyHex && <p><strong>Private Key (HEX):</strong> {found.privateKeyHex}</p>}
          {found.privateKeyWif && <p><strong>Private Key (WIF):</strong> {found.privateKeyWif}</p>}
        </div>
      )}
    </div>
  );
  }
