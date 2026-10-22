"use client";
import { useState } from "react";

function base58Decode(str: string): Uint8Array {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let num = 0n;
  for (let c of str) { num = num * 58n + BigInt(ALPHABET.indexOf(c)); }
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let leadingZeros = 0;
  for (let c of str) { if (c === '1') leadingZeros++; else break; }
  const bytes = new Uint8Array(leadingZeros + hex.length / 2);
  for (let i = 0; i < hex.length / 2; i++) { bytes[leadingZeros + i] = parseInt(hex.substr(i*2, 2), 16); }
  return bytes;
}
function wifToHex(wif: string): string | null {
  try {
    const bytes = base58Decode(wif.trim());
    if (bytes.length < 37) return null;
    return Buffer.from(bytes.slice(1, 33)).toString("hex");
  } catch { return null; }
}

export default function RangeFinderPage() {
  const [input, setInput] = useState("");
  const [res, setRes] = useState<any>(null);
  const findRange = () => {
    try {
      let hex = input.trim();
      if (!hex) return;
      if (hex.startsWith("5") || hex.startsWith("K") || hex.startsWith("L") || hex.startsWith("c")) {
        const converted = wifToHex(hex);
        if (converted) hex = converted;
      }
      hex = hex.toLowerCase().replace(/^0x/, "").replace(/[^0-9a-f]/g, "");
      if (!hex) return alert("المفتاح غير صحيح");
      if (hex.length > 64) hex = hex.slice(-64);
      const clean = hex.replace(/^0+/, "") || "0";
      const len = clean.length;
      const min = "1" + "0".repeat(len - 1);
      const max = "f".repeat(len);
      const cur = BigInt("0x" + clean);
      const minB = BigInt("0x" + min);
      const maxB = BigInt("0x" + max);
      const rangeSize = maxB - minB + 1n;
      const pos = rangeSize > 0n ? Number((cur - minB) * 10000n / rangeSize) / 100 : 0;
      setRes({ original: input.trim(), hex: clean, len, bits: len * 4, min, max, dec: cur.toString(), pos: pos.toFixed(4) + "%" });
    } catch { alert("خطأ فالمفتاح"); }
  };
  return (
    <div style={{padding:"20px", maxWidth:"750px", margin:"0 auto", fontFamily:"monospace", background:"#000", color:"#fff", minHeight:"100vh"}}>
      <h1 style={{fontSize:"24px", fontWeight:"bold"}}>🔍 Range Finder</h1>
      <p style={{color:"#888", fontSize:"14px"}}>btcvanityb.vercel.app/range-finder</p>
      <input value={input} onChange={e=>setInput(e.target.value)} placeholder="HEX أو WIF (5J... / K... / L...)" style={{width:"100%", padding:"14px", marginTop:"15px", background:"#111", border:"1px solid #333", color:"#fff", borderRadius:"8px"}}/>
      <button onClick={findRange} style={{width:"100%", padding:"14px", marginTop:"12px", background:"#f7931a", color:"#fff", border:"none", borderRadius:"8px", fontWeight:"bold", fontSize:"16px", cursor:"pointer"}}>عطيني الـ Range</button>
      {res && (
        <div style={{marginTop:"20px", background:"#111", padding:"16px", borderRadius:"12px", border:"1px solid #222", wordBreak:"break-all", lineHeight:"1.8"}}>
          <div><span style={{color:"#888"}}>HEX:</span> <span style={{color:"#0f0"}}>{res.hex}</span></div>
          <div><span style={{color:"#888"}}>SIZE:</span> {res.len} = {res.bits} BITS</div>
          <hr style={{borderColor:"#222", margin:"12px 0"}}/>
          <div><span style={{color:"#888"}}>MIN:</span><br/><span style={{color:"#0ff"}}>{res.min}</span></div>
          <div style={{marginTop:"8px"}}><span style={{color:"#888"}}>MAX:</span><br/><span style={{color:"#ff5555"}}>{res.max}</span></div>
          <hr style={{borderColor:"#222", margin:"12px 0"}}/>
          <div><span style={{color:"#888"}}>POSITION:</span> <b style={{color:"#f7931a"}}>{res.pos}</b></div>
        </div>
      )}
    </div>
  );
}
