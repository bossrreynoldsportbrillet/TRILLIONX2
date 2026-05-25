#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1

echo "============================================================"
echo " TRILLIONX CODESPACES DISPLAY ACCELERATOR"
echo "============================================================"

mkdir -p .vscode reports history

echo "=== sauvegarde settings actuel ==="
cp .vscode/settings.json ".vscode/settings.before_display_accel_$(date +%Y%m%d_%H%M%S).json" 2>/dev/null || true

cat > .vscode/settings.json <<'JSON'
{
  "files.watcherExclude": {
    "**/.git/objects/**": true,
    "**/.git/subtree-cache/**": true,
    "**/node_modules/**": true,
    "**/logs/**": true,
    "**/runtime_state/**": true,
    "**/history/**": true,
    "**/reports/**": true,
    "**/backups/**": true,
    "**/data/**": true,
    "**/raid60_plus/**": true,
    "**/.cache/**": true
  },
  "search.exclude": {
    "**/node_modules": true,
    "**/.git": true,
    "**/logs": true,
    "**/runtime_state": true,
    "**/history": true,
    "**/reports": true,
    "**/backups": true,
    "**/data": true,
    "**/raid60_plus": true,
    "**/.cache": true
  },
  "files.exclude": {
    "**/.git": true,
    "**/.cache": true
  },
  "git.autorefresh": false,
  "git.autofetch": false,
  "git.decorations.enabled": false,
  "explorer.decorations.badges": false,
  "explorer.decorations.colors": false,
  "terminal.integrated.scrollback": 1000,
  "terminal.integrated.gpuAcceleration": "off",
  "terminal.integrated.enablePersistentSessions": false,
  "typescript.tsserver.maxTsServerMemory": 512,
  "typescript.disableAutomaticTypeAcquisition": true,
  "npm.autoDetect": "off",
  "grunt.autoDetect": "off",
  "gulp.autoDetect": "off",
  "jake.autoDetect": "off",
  "extensions.ignoreRecommendations": true,
  "workbench.startupEditor": "none",
  "workbench.editor.restoreViewState": false,
  "workbench.list.smoothScrolling": false,
  "editor.minimap.enabled": false,
  "editor.codeLens": false,
  "editor.renderWhitespace": "none",
  "editor.hover.delay": 800,
  "breadcrumbs.enabled": false,
  "outline.showFiles": false,
  "problems.autoReveal": false
}
JSON

node -e "JSON.parse(require('fs').readFileSync('.vscode/settings.json','utf8')); console.log('VS CODE DISPLAY SETTINGS OK')"

cat > scripts/trillionx_fast_terminal.sh <<'SH'
#!/usr/bin/env bash
set -u
cd /workspaces/TRILLIONX || exit 1
clear
echo "=== TRILLIONX FAST TERMINAL ==="
echo "Affichage terminal allégé."
echo "Commande normale : bash scripts/start_safe.sh"
echo "Monitoring court : bash scripts/trillionx_resource_percent.sh"
SH

chmod +x scripts/trillionx_fast_terminal.sh

node - <<'NODE'
const fs=require("fs"),crypto=require("crypto");
const rep={
  engine:"TRILLIONX_CODESPACES_DISPLAY_ACCELERATOR",
  time:new Date().toISOString(),
  status:"DISPLAY_ACCELERATION_SETTINGS_APPLIED",
  safe:true,
  touches:[".vscode/settings.json","scripts/trillionx_fast_terminal.sh"],
  does_not_touch:["app.js","data","raid60_plus","node_modules","controllers"],
  effects:[
    "less file watching",
    "less Git UI refresh",
    "less terminal scroll memory",
    "less search load",
    "faster explorer display"
  ]
};
rep.seal=crypto.createHash("sha256").update(JSON.stringify(rep)).digest("hex");
fs.writeFileSync("reports/TRILLIONX_DISPLAY_ACCELERATOR_LATEST.json",JSON.stringify(rep,null,2));
fs.appendFileSync("history/TRILLIONX_DISPLAY_ACCELERATOR_HISTORY.jsonl",JSON.stringify({time:rep.time,status:rep.status,seal:rep.seal})+"\n");
console.log(JSON.stringify(rep,null,2));
NODE

git add .vscode/settings.json scripts/trillionx_fast_terminal.sh reports/TRILLIONX_DISPLAY_ACCELERATOR_LATEST.json history/TRILLIONX_DISPLAY_ACCELERATOR_HISTORY.jsonl 2>/dev/null || true
git commit -m "Accelerate TRILLIONX Codespaces display" || echo "Rien à commit"

echo "============================================================"
echo " ✅ DISPLAY ACCELERATOR INSTALLE"
echo " Clique ensuite: Redémarrer l’hôte d’extension distant"
echo " Puis lance: bash scripts/trillionx_fast_terminal.sh"
echo "============================================================"
