#!/usr/bin/env pwsh

<#
.SYNOPSIS
    Publish instrux package to npm
.DESCRIPTION
    Builds the project and publishes to npm registry.
    Performs validation checks before publishing.
#>

param(
    [switch]$DryRun,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

Write-Host "📦 Publishing instrux to npm..." -ForegroundColor Cyan

# Check if logged in to npm
Write-Host "`n🔐 Checking npm authentication..." -ForegroundColor Yellow
$whoami = npm whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Not logged in to npm. Run 'npm login' first." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Logged in as: $whoami" -ForegroundColor Green

# Check git status
Write-Host "`n📋 Checking git status..." -ForegroundColor Yellow
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Host "⚠  Warning: You have uncommitted changes:" -ForegroundColor Yellow
    git status --short
    $continue = Read-Host "`nContinue anyway? (y/N)"
    if ($continue -ne 'y' -and $continue -ne 'Y') {
        Write-Host "❌ Publish cancelled." -ForegroundColor Red
        exit 1
    }
}

# Build the project
if (-not $SkipBuild) {
    Write-Host "`n🔨 Building project..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed!" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ Build successful" -ForegroundColor Green
} else {
    Write-Host "`n⏭  Skipping build" -ForegroundColor Yellow
}

# Check if dist directory exists
if (-not (Test-Path "dist")) {
    Write-Host "❌ dist/ directory not found. Run build first." -ForegroundColor Red
    exit 1
}

# Show package info
Write-Host "`n📄 Package information:" -ForegroundColor Yellow
$package = Get-Content "package.json" | ConvertFrom-Json
Write-Host "  Name:    $($package.name)" -ForegroundColor Cyan
Write-Host "  Version: $($package.version)" -ForegroundColor Cyan
Write-Host "  License: $($package.license)" -ForegroundColor Cyan

# Dry run check
if ($DryRun) {
    Write-Host "`n🔍 Performing dry run..." -ForegroundColor Yellow
    npm publish --dry-run
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✓ Dry run successful!" -ForegroundColor Green
        Write-Host "  Run without --DryRun to actually publish." -ForegroundColor Cyan
    } else {
        Write-Host "`n❌ Dry run failed!" -ForegroundColor Red
        exit 1
    }
} else {
    # Confirm publication
    Write-Host "`n⚠  Ready to publish $($package.name)@$($package.version)" -ForegroundColor Yellow
    $confirm = Read-Host "Proceed with publication? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "❌ Publish cancelled." -ForegroundColor Red
        exit 1
    }

    # Publish to npm
    Write-Host "`n🚀 Publishing to npm..." -ForegroundColor Yellow
    npm publish --access public
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Successfully published $($package.name)@$($package.version)!" -ForegroundColor Green
        Write-Host "   View at: https://www.npmjs.com/package/$($package.name)" -ForegroundColor Cyan
        
        # Suggest git tag
        Write-Host "`n💡 Don't forget to tag this release:" -ForegroundColor Yellow
        Write-Host "   git tag v$($package.version)" -ForegroundColor Cyan
        Write-Host "   git push origin v$($package.version)" -ForegroundColor Cyan
    } else {
        Write-Host "`n❌ Publish failed!" -ForegroundColor Red
        exit 1
    }
}
