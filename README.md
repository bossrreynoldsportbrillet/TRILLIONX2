![Code](https://img.shields.io/badge/code-181%20021%20lignes-FFB347?style=for-the-badge)




![Fichiers JS](https://img.shields.io/badge/JS-353%20fichiers-5BD9A0?style=for-the-badge)




![Doctrine](https://img.shields.io/badge/doctrine-REAL__ONLY__OR__UNAVAILABLE-E5604C?style=for-the-badge)

# TRILLIONX2

LINES=$(find . -path ./TX3/node_modules -prune -o \( -name "*.js" -o -name "*.sh" \) -print | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
echo "Badge à jour: 

![Code](https://img.shields.io/badge/code-${LINES}%20lignes-FFB347?style=for-the-badge)

"
