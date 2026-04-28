# Releasing Sutura via GitHub Actions

This guide explains how to release new versions of Sutura and trigger the automatic build process.

## How the Automation Works

Unlike Vercel, which builds every push, this workflow is **Tag-Based**.
The build server will only start when you explicitly "tag" a commit with a version number (like `v1.0.0`). This keeps your regular development pushes separate from your official releases.

## Step-by-Step Release Process

### 1. Update Version

Before releasing, ensure your `package.json` version matches your intended release.

```json
"version": "1.0.0"
```

### 2. Tag and Push

When your code is ready for a release, run these commands in your terminal:

```bash
# 1. Create a version tag
git tag v1.0.0

# 2. Push the code to GitHub
git push origin main

# 3. Push the tag to GitHub (This triggers the build!)
git push origin v1.0.0
```

### 3. Track the Build

1. Go to your repository on GitHub.com.
2. Click the **Actions** tab.
3. You will see a workflow named "Release Sutura" running.
4. It will automatically:
   - Start a Windows virtual machine.
   - Install Node.js `v24.14.1`.
   - Run your `rebuild:native` scripts.
   - Compile the `.exe` installer.
   - Create a **Draft Release** in the "Releases" section.

### 4. Publish the Release

1. Once the Action finishes, go to the **Releases** section on the right side of your GitHub repo.
2. You will see a new "Draft" release containing your `.exe` and the `latest.yml` file.
3. Click **Edit**, add your release notes (e.g., "Initial Release"), and click **Publish Release**.

## Why this is better than "Build on Push"

- **Separation:** You can push "Work in Progress" code to `main` as many times as you want without wasting build minutes or triggering the auto-updater.
- **Confirmation:** The build only happens when you decide a version is "Final" by tagging it.
- **Native Stability:** Because this uses a Windows Runner, it correctly compiles the C++ modules (`nodejieba`, `tree-sitter`) so they work perfectly on the users' machines.

## Security Note

The workflow uses a built-in `${{ secrets.GITHUB_TOKEN }}`. You don't need to configure anything; GitHub provides this token automatically to allow the script to upload the installer to your releases.
