const ts=require("typescript"),fs=require("fs"),path=require("path");
for(const f of process.argv.slice(2)){
  const src=fs.readFileSync(f,"utf8");
  const kind=f.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS;
  const sf=ts.createSourceFile(path.basename(f),src,ts.ScriptTarget.Latest,true,kind);
  const d=sf.parseDiagnostics||[];
  if(d.length){
    console.log("BROKEN "+d.length+"  "+f);
    const lc=sf.getLineAndCharacterOfPosition(d[0].start);
    console.log("    L"+(lc.line+1)+": "+src.split('\n')[lc.line].trim().slice(0,80));
  }
}
console.log("--- scan complete ---");
