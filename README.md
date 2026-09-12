# SignBuddy — Learn & Practice ASL Fingerspelling

SignBuddy is a browser app with two modes:

- **Learn** — a grid of 7 ASL fingerspelling letters (B, I, L, U, V, W, Y), each shown with a "finger map" diagram and a short description of the hand shape.
- **Practice** — turns on your webcam, tracks your hand in real time, and quizzes you: it shows a target letter, and tells you as soon as it recognizes you're holding the correct shape.

Everything runs locally in the browser. No video or image is ever sent to a server — the hand-tracking model runs on your own device.

## How to run it

1. Keep `index.html`, `style.css`, and `script.js` in the same folder.
2. Open `index.html` in a recent version of Chrome or Edge, with an internet connection (the hand-tracking library loads from a CDN — see Attribution below).
3. Click the **Practice** tab, then **Turn on camera**, and allow camera access when the browser asks.

## How the recognition actually works

This project does **not** use a trained machine-learning model for the sign classification itself. Instead it uses hand-tracking (MediaPipe Hands) to find 21 key points on the hand, and then a hand-written geometric rule set decides which letter those points spell. That split matters for judging, so here's the breakdown:

- **MediaPipe Hands (external, pre-trained):** takes a camera frame and returns the (x, y, z) position of 21 landmarks on the hand — fingertips, knuckles, wrist. This part is Google's model; SignBuddy does not train or modify it.
- **`classifyHand()` in `script.js` (original logic):** this is the part written for this project. It turns the 21 raw points into a decision.

### The algorithm, step by step

1. **Is each finger straight or curled?** For the index, middle, ring, and pinky, compare how far the *fingertip* is from the wrist to how far the *middle knuckle* is from the wrist. If the tip is further out than the knuckle, the finger is reaching away from the hand, so it counts as straight. This is more reliable than just comparing height on screen, because it still works when the hand is tilted, not just held perfectly upright.
2. **Is the thumb out?** Compare the thumb tip's distance from the index knuckle to the thumb's own base distance from that same knuckle. If the tip has moved noticeably further away, the thumb is counted as extended.
3. **Are the index and middle fingers apart or together?** This is the one case where the finger-straight/curled pattern alone isn't enough — U and V use the exact same two fingers. So SignBuddy also measures the gap between the index and middle fingertip, scaled by the size of the hand (so it works whether the hand is close to or far from the camera). A wide gap means V; a narrow gap means U.
4. **Match against the letter table.** Each letter in `LETTERS` is defined as a pattern of which fingers are straight, whether the thumb is out, and (for U/V only) the spread. The code checks the live reading against each letter in turn and returns the first match, or `null` if nothing matches.
5. **Require a steady hold.** A single matching frame isn't enough to count — the quiz waits for about 18 consecutive matching frames (roughly half a second) before accepting the sign as correct. This avoids false positives from the hand briefly passing through a shape while moving.

This is essentially a small **decision tree** built by hand from domain knowledge about ASL handshapes, rather than learned from labelled examples — a deliberate design choice explained more in Design Decisions below.

## Why only 7 letters?

The 26-letter ASL alphabet includes shapes that need more than "which fingers are straight" to tell apart — for example C and O are about the *curve* of the fingers, and A and D depend on exactly where the thumb touches another finger. B, I, L, U, V, W, Y were chosen because they can be told apart reliably using only the straight/curled + thumb-out + spread checks described above, which keeps the algorithm simple enough to fully explain and trust. Extending the letter set is the main item in Future Improvements.

## Design decisions

- **Finger map instead of photos:** the Learn cards and the live Practice readout both use the same simple 5-bar diagram (lit = extended, dim = curled) instead of photos of hands. This was a deliberate choice: it's the *exact* feature the algorithm uses to make its decision, so learning to read the diagram in Learn mode directly prepares you to understand what the camera is doing in Practice mode.
- **Rule-based over machine-learned:** a trained classifier would need a labelled dataset of hand shapes and would be a "black box" that's hard to explain or debug. The geometric rule set is fully inspectable — every decision can be traced back to specific landmark distances, which fits the goal of demonstrating computational thinking, not just getting an answer.
- **Hold-to-confirm instead of instant match:** early testing (mentally, while designing) showed a single-frame match would flicker between letters as fingers moved past intermediate positions. Requiring a steady hold turns a noisy per-frame signal into a stable decision.

## Future improvements

- Add more letters (A, C, D, O, etc.) using additional geometric checks, such as thumb-to-fingertip distance for "touching" shapes and finger curl angle for curved shapes like C.
- Support motion-based letters (J and Z involve movement, not a static pose) by tracking the fingertip path over several frames instead of a single frame.
- Add a "practice by word" mode that chains several letters into a spelling challenge.
- Track accuracy per letter over multiple sessions to show a learner which shapes they should keep practicing.

## Attribution

- **MediaPipe Hands, Camera Utils, Drawing Utils** — Copyright Google LLC, licensed under the Apache License 2.0. Loaded from the `jsdelivr` CDN in `index.html`; not modified.
- **Fonts:** "Fredoka" and "Work Sans", both from Google Fonts, licensed under the SIL Open Font License.
- All HTML, CSS, and the `classifyHand()` recognition logic in `script.js` were written for this project.

## AI usage disclosure

Fill in this section for submission with specifics of what you asked the AI tool, and what you changed or added yourself — for example:

| AI tool used | Purpose of use | Output generated | My contribution / modification |
|---|---|---|---|
| e.g. Claude | e.g. Drafted the initial `classifyHand()` geometric rules and the HTML/CSS layout | e.g. First version of the finger-extended distance check and the page structure | e.g. Adjusted the extension thresholds after testing on my own hand, added the hold-to-confirm logic, redesigned the finger-map colors, wrote the letter descriptions |

If you make changes to the code after receiving it, list them here so you can speak to them confidently during judging — you'll be asked to explain any part of this code, including the distance-based math in `classifyHand()`, so make sure you can walk through it line by line before the demo.
