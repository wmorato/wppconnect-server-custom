#!/bin/bash

echo "🗑️  Removendo Husky e hooks do projeto..."

# Apagar pasta husky
rm -rf .husky
echo "✅ Pasta .husky removida."

# Remover arquivos de configuração
rm -f commitlint.config.js .lintstagedrc .lintstagedrc.js .commitlintrc .commitlintrc.js
echo "✅ Arquivos de configuração do commitlint removidos."

# Remover dependências (se existirem)
npm uninstall husky @commitlint/cli @commitlint/config-conventional lint-staged --save-dev
echo "✅ Dependências npm removidas (se existiam)."

# Remover configurações do package.json (avisar usuário para editar manualmente se tiver)
echo "⚠️ Verifique o package.json e remova se existirem os blocos 'husky' ou 'lint-staged'."

# Fazer commit
git add .
git commit -m "Removido Husky, hooks e configs relacionadas"
git push

echo "🚀 Pronto! Husky removido com sucesso. Push realizado."
