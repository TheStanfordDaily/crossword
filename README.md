# Crossword Embed Guide

How to upload a `.puz` file and embed a playable crossword in WordPress.

---

## 1. Upload the puzzle file

1. In this repository, create a `puzzles/` folder if it doesn't exist yet.
2. Add your `.puz` file there — use a date or slug as the filename:
   ```
   puzzles/2024-01-15.puz
   puzzles/my-puzzle.puz
   ```
3. Commit and push to `main`. GitHub Pages will publish it automatically within ~30 seconds.
4. Your puzzle's public URL will be:
   ```
   https://<your-username>.github.io/<repo-name>/puzzles/<filename>.puz
   ```
   For example:
   ```
   https://annayang.github.io/crossword/puzzles/2024-01-15.puz
   ```

---

## 2. Generate the embed code

1. Open the embed generator:
   ```
   https://<your-username>.github.io/<repo-name>/generate.html
   ```
2. Paste your puzzle's public URL into the **Puzzle file URL** field.
3. Set the **iFrame height** (700px works well for standard 15×15 grids).
4. Click **Generate Embed Code** — the generator fetches the puzzle to read its title.
5. Click **Copy** to copy the HTML snippet.

---

## 3. Embed in WordPress

1. In the WordPress block editor, add a **Custom HTML** block where you want the puzzle.
2. Paste the copied snippet. It looks like this:
   ```html
   <div style="max-width:760px; margin:0 auto;">
     <iframe
       src="https://annayang.github.io/crossword/?puz=https%3A%2F%2F...&embed=1"
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
3. Save or publish the post.

> **Note:** The `allow="clipboard-write"` attribute is required for the in-puzzle "Share Result" button to copy to the clipboard.

---

## Height guide

| Grid size | Recommended height |
|---|---|
| 15×15 (standard daily) | 700 px |
| 21×21 (Sunday) | 900 px |
| Mini (5×5) | 400 px |

On mobile the layout stacks vertically, so the iframe will scroll naturally — no changes needed.

---

## Troubleshooting

**"Could not load puzzle: CORS restriction"** in the generator  
→ The puzzle URL must be publicly accessible and served with CORS headers. Raw GitHub Pages files (`github.io`) work. Raw `githubusercontent.com` links also work. Self-hosted files may need `Access-Control-Allow-Origin: *` set on the server.

**Puzzle loads but shows blank grid**  
→ Check that the `.puz` file is a valid Across Lite format file. Files exported from Crossword Compiler, Black Ink, or Crossfire all work. Password-protected (scrambled) puzzles cannot be played and will show a warning.

**iframe is cut off or too short**  
→ Increase the `height` value in the embed snippet, or re-generate with a larger height in the generator.
