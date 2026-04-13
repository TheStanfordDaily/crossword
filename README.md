# Crossword Embed Guide

How to upload a `.puz` file and embed a playable crossword in WordPress.

---

## 1. Upload the puzzle file

1. In this repository, upload the `.puz` into the `puzzles/` folder.
2. Use a date or slug as the filename (for ease of understanding). For example:
   ```
   puzzles/2024-01-15.puz
   puzzles/dimi500.puz
   ```
3. Commit and push to `main`. GitHub Pages will publish it automatically within ~30 seconds.
4. Your puzzle's public URL will be:
   ```
   https://<your-username>.github.io/<repo-name>/puzzles/<filename>.puz
   ```
   For example:
   ```
   https://thestanforddaily.github.io/crossword/puzzles/2024-01-15.puz
   ```

---

## 2. Generate the embed code

1. Open the embed generator:
   ```
   https://thestanforddaily.github.io/crossword/generate.html
   ```
2. Paste your puzzle's public URL into the **Puzzle file URL** field.
3. Select either "Daily Diminutive" or "Daily Crossword"
4. Fill in the puzzle number
5. Click **Generate Embed Code** — the generator fetches the puzzle to read its title.
6. Click **Copy** to copy the HTML snippet.

---

## 3. Embed in WordPress

1. In the WordPress block editor, add a **Custom HTML** block where you want the puzzle.
2. Paste the copied snippet. It looks like this:
   ```html
   <div style="max-width:760px; margin:0 auto;">
     <iframe
       src="https://thestanforddaily.github.io/crossword/?puz=https%3A%2F%2F...&embed=1"
       width="100%"
       height="700"
       frameborder="0"
       scrolling="no"
       style="border:none; border-radius:8px; overflow:hidden;"
       title="Crossword — My Puzzle Title"
       allow="clipboard-write">
     </iframe>
   </div>
   ```
