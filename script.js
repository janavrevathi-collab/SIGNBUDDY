/* ==========================================================
   SignBuddy — app logic
   ----------------------------------------------------------
   This file has three jobs:
     1. Store the letter data (name + finger pattern + tip)
     2. Turn 21 hand landmarks from MediaPipe into a simple
        "which fingers are straight?" reading (the algorithm)
     3. Run the two screens: Learn (static cards) and
        Practice (live webcam quiz)
   ========================================================== */

/* ---------------------------------------------------------
   1. LETTER DATA
   Each letter is defined by which of the 4 fingers are
   straight (index, middle, ring, pinky) and whether the
   thumb is held out. U and V share the same finger pattern
   and are told apart by how far apart the index/middle
   fingertips are (see classifyHand below).
   --------------------------------------------------------- */
const LETTERS = {
  B: { pattern: [1,1,1,1], thumb: 0, tip: "All four fingers straight up, thumb folded flat across the palm." },
  W: { pattern: [1,1,1,0], thumb: 0, tip: "Index, middle and ring finger up in a tripod; pinky and thumb tucked in." },
  V: { pattern: [1,1,0,0], thumb: 0, tip: "Index and middle up, spread apart like a peace sign.", spread: "wide" },
  U: { pattern: [1,1,0,0], thumb: 0, tip: "Index and middle up, held tightly together, no gap.", spread: "narrow" },
  L: { pattern: [1,0,0,0], thumb: 1, tip: "Index finger straight up, thumb out to the side — an L shape." },
  I: { pattern: [0,0,0,1], thumb: 0, tip: "Just the pinky sticking straight up, everything else curled in." },
  Y: { pattern: [0,0,0,1], thumb: 1, tip: "Pinky and thumb both stretched out, the 'hang loose' shape." },
};
const LETTER_ORDER = ["B","W","V","U","L","I","Y"];
const FINGER_LABELS = ["Thumb","Index","Middle","Ring","Pinky"];

/* ---------------------------------------------------------
   2. FINGER MAP RENDERING
   Builds the 5-bar "finger map" UI used in both the Learn
   cards and the live Practice readout, from a 5-length
   boolean array [thumb, index, middle, ring, pinky].
   --------------------------------------------------------- */
function buildFingerMap(container, boolArray, withLabels){
  container.innerHTML = "";
  FINGER_LABELS.forEach((label, i) => {
    const bar = document.createElement("div");
    bar.className = "finger-bar " + label.toLowerCase();
    bar.dataset.extended = !!boolArray[i];
    if (withLabels){
      const span = document.createElement("span");
      span.textContent = label[0];
      bar.appendChild(span);
    }
    container.appendChild(bar);
  });
}

function letterToBoolArray(key){
  const def = LETTERS[key];
  return [def.thumb, ...def.pattern];
}

/* Populate the Learn tab grid from LETTERS, in one place,
   so the card content can never drift out of sync with the
   actual detection rules used in Practice mode. */
function renderLearnGrid(){
  const grid = document.getElementById("letter-grid");
  LETTER_ORDER.forEach(key => {
    const card = document.createElement("article");
    card.className = "letter-card";
    card.innerHTML = `
      <div class="letter-card-head">
        <span class="letter">${key}</span>
        <span class="word">Letter ${key}</span>
      </div>
      <div class="finger-map"></div>
      <p class="desc">${LETTERS[key].tip}</p>
    `;
    buildFingerMap(card.querySelector(".finger-map"), letterToBoolArray(key), true);
    grid.appendChild(card);
  });
}

/* ---------------------------------------------------------
   3a. TAB SWITCHING
   --------------------------------------------------------- */
const tabLearn = document.getElementById("tab-learn");
const tabPractice = document.getElementById("tab-practice");
const panelLearn = document.getElementById("panel-learn");
const panelPractice = document.getElementById("panel-practice");

function setTab(which){
  const learnActive = which === "learn";
  tabLearn.classList.toggle("is-active", learnActive);
  tabPractice.classList.toggle("is-active", !learnActive);
  tabLearn.setAttribute("aria-selected", learnActive);
  tabPractice.setAttribute("aria-selected", !learnActive);
  panelLearn.hidden = !learnActive;
  panelPractice.hidden = learnActive;
}
tabLearn.addEventListener("click", () => setTab("learn"));
tabPractice.addEventListener("click", () => setTab("practice"));

/* ---------------------------------------------------------
   3b. HAND CLASSIFIER
   Turns 21 MediaPipe landmarks into finger booleans, then
   matches that pattern (plus the U/V spread check) against
   LETTERS to get a guess.

   Why "distance from wrist" instead of just comparing y?
   A raw y-comparison breaks the moment the hand tilts.
   Comparing each fingertip's distance from the wrist to its
   own knuckle's distance from the wrist is a simple way to
   tell "reaching away from the hand" (extended) from
   "folded back toward the palm" (curled) that keeps working
   across a reasonable range of hand rotation.
   --------------------------------------------------------- */
function dist(a, b){
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function classifyHand(lm){
  const wrist = lm[0];
  const handSize = dist(lm[0], lm[9]) || 0.001; // wrist -> middle knuckle, used to scale thresholds

  const fingerDefs = [
    { tip: 8,  pip: 6  },  // index
    { tip: 12, pip: 10 },  // middle
    { tip: 16, pip: 14 },  // ring
    { tip: 20, pip: 18 },  // pinky
  ];
  const extended = fingerDefs.map(f => dist(wrist, lm[f.tip]) > dist(wrist, lm[f.pip]) * 1.1);

  // Thumb: extended if its tip has moved well away from the
  // index knuckle relative to where the thumb's own base sits.
  const thumbExtended = dist(lm[4], lm[5]) > dist(lm[2], lm[5]) * 1.15;

  // Spread between index and middle fingertip, scaled by hand
  // size, is what tells U (fingers together) from V (fingers apart).
  const spreadRatio = dist(lm[8], lm[12]) / handSize;
  const spread = spreadRatio > 0.55 ? "wide" : "narrow";

  const boolArray = [thumbExtended, ...extended];

  let match = null;
  for (const key of LETTER_ORDER){
    const def = LETTERS[key];
    const patternMatches = def.pattern.every((v, i) => !!v === extended[i]);
    const thumbMatches = !!def.thumb === thumbExtended;
    const spreadMatches = !def.spread || def.spread === spread;
    if (patternMatches && thumbMatches && spreadMatches){ match = key; break; }
  }

  return { letter: match, boolArray };
}

/* ---------------------------------------------------------
   3c. PRACTICE MODE / QUIZ LOOP
   --------------------------------------------------------- */
const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const placeholder = document.getElementById("camera-placeholder");
const startBtn = document.getElementById("start-camera");
const targetLetterEl = document.getElementById("target-letter");
const liveMap = document.getElementById("live-finger-map");
const statusEl = document.getElementById("status-msg");
const holdFill = document.getElementById("hold-fill");
const scoreEl = document.getElementById("score");
const attemptsEl = document.getElementById("attempts");
const skipBtn = document.getElementById("skip-btn");

let score = 0, attempts = 0;
let targetLetter = pickTarget();
let holdFrames = 0;
const HOLD_NEEDED = 18; // ~0.6s at 30fps of a steady, correct sign before we accept it

function pickTarget(){
  return LETTER_ORDER[Math.floor(Math.random() * LETTER_ORDER.length)];
}

function newRound(advanceScore){
  if (advanceScore !== undefined){
    attempts++;
    if (advanceScore) score++;
    scoreEl.textContent = score;
    attemptsEl.textContent = attempts;
  }
  targetLetter = pickTarget();
  targetLetterEl.textContent = targetLetter;
  holdFrames = 0;
  holdFill.style.width = "0%";
}
targetLetterEl.textContent = targetLetter;
buildFingerMap(liveMap, [0,0,0,0,0], true);

skipBtn.addEventListener("click", () => newRound(false));

function onResults(results){
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const hasHand = results.multiHandLandmarks && results.multiHandLandmarks.length > 0;

  if (hasHand){
    const lm = results.multiHandLandmarks[0];
    window.drawConnectors(ctx, lm, Hands.HAND_CONNECTIONS, { color: "#E3A63B", lineWidth: 3 });
    window.drawLandmarks(ctx, lm, { color: "#F4EFE3", radius: 3 });

    const { letter, boolArray } = classifyHand(lm);
    buildFingerMap(liveMap, boolArray, true);

    if (letter === targetLetter){
      holdFrames++;
      statusEl.textContent = `That's a ${letter}! Hold it steady…`;
      statusEl.dataset.state = "correct";
    } else {
      holdFrames = Math.max(0, holdFrames - 2);
      statusEl.textContent = letter ? `I'm seeing ${letter}, not ${targetLetter} yet.` : "Show a hand shape from the letter list.";
      statusEl.dataset.state = letter ? "wrong" : "idle";
    }

    holdFill.style.width = Math.min(100, (holdFrames / HOLD_NEEDED) * 100) + "%";

    if (holdFrames >= HOLD_NEEDED){
      newRound(true);
    }
  } else {
    buildFingerMap(liveMap, [0,0,0,0,0], true);
    statusEl.textContent = "I can't see a hand — move it into frame.";
    statusEl.dataset.state = "idle";
    holdFrames = Math.max(0, holdFrames - 2);
    holdFill.style.width = Math.min(100, (holdFrames / HOLD_NEEDED) * 100) + "%";
  }

  ctx.restore();
}

let hands, camera;

startBtn.addEventListener("click", async () => {
  placeholder.querySelector("p").textContent = "Starting camera…";
  try{
    hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
    hands.onResults(onResults);

    camera = new Camera(video, {
      onFrame: async () => { await hands.send({ image: video }); },
      width: 640,
      height: 480,
    });
    await camera.start();
    placeholder.style.display = "none";
  } catch (err){
    placeholder.querySelector("p").textContent =
      "Couldn't access the camera. Check that this page has camera permission and try again.";
    console.error(err);
  }
});

/* ---------------------------------------------------------
   Init
   --------------------------------------------------------- */
renderLearnGrid();
