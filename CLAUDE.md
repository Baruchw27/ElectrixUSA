# Notes for Claude

- The website (live = repo root, staging = /staging) is published by GitHub Pages from the **gh-pages** branch, not main.
  After committing to main, also run `git push origin main:gh-pages`, then confirm the served EX_VER with a ?b= cache-buster.
- Every release: bump EX_VER in index.html AND version.json (live: {"v":"vh.."}; staging/version.json: {"v":"vs.."}) and the sw.js cache name.
  If version.json does not match EX_VER, every phone restarts itself after opening and shows "Update ready" forever.
