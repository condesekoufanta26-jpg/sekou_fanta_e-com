# start-benchmark.ps1
# Script de démarrage pour les tests de performance (benchmark)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   MODE BENCHMARK - NESTJS API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Configurer le thread pool pour bcrypt
$env:UV_THREADPOOL_SIZE = "32"
Write-Host "✓ UV_THREADPOOL_SIZE = $env:UV_THREADPOOL_SIZE" -ForegroundColor Green

# 2. Définir l'environnement
$env:NODE_ENV = "benchmark"
Write-Host "✓ NODE_ENV = $env:NODE_ENV" -ForegroundColor Green

# 3. Lire BCRYPT_ROUNDS depuis .env (optionnel, vérifier)
$env:BCRYPT_ROUNDS = "8"
Write-Host "✓ BCRYPT_ROUNDS = $env:BCRYPT_ROUNDS" -ForegroundColor Green

# 4. Démarrer l'application
Write-Host "`n🚀 Démarrage de l'API en mode benchmark..." -ForegroundColor Yellow
Write-Host ""

npm run start:dev