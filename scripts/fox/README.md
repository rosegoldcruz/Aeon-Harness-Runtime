# Aeon Fox assets

The two deployable models are in `public/models/`:

- `aeon-fox-full-body.glb`: textured Meshy character, humanoid skin and looping Walk clip.
- `aeon-fox-head.glb`: isolated head with a capped neck, split lip seam, mouth interior, facial skeleton and `jawOpen`, `mouthFunnel`, `mouthSmile` morphs. The separate mouth interior also has a `jawOpen` morph.

The original user illustration was submitted to Meshy image-to-3d in A pose with PBR textures and a 30,000-face remesh target. `aeon-fox.json` records the generation and rigging task IDs. Blender then prepared the web exports and built the facial rig. The body retains Meshy's walking skeleton.

## Local source projects

The editable projects are `assets/fox/aeon-fox-full-body.blend` and `assets/fox/aeon-fox-head.blend`, committed alongside the GLB exports. The `.aeon-assets/` directory is deliberately ignored: it contains temporary downloads and API responses with expiring signed URLs. No Meshy credential is stored in this repository.

To resume downloads using the locally authenticated Meshy CLI, run:

```powershell
python scripts/fox/meshy_pipeline.py --task 01a15116-f75b-76ff-95e7-431868a0d49b
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/fox/prepare_assets.py
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/fox/verify_assets.py
```

The pipeline records the rigging ID locally and uses a stable operation ID to avoid duplicate paid submissions on retries. It does not regenerate the model or buy credits. The Blender preparation script is calibrated to this source model's dimensions and facial landmarks; inspect and recalibrate it before using a different model.

## Harness speech integration

The app loads the fox lazily. The full body walks across the bottom of the viewport. **Talk to Aeon** opens the head with Speak, Stop, Pause walk and model downloads. Reduced-motion preferences stop roaming and idle head motion.

Send a real harness answer to the companion from client code:

```ts
window.dispatchEvent(new CustomEvent("aeon:speak", {
  detail: {
    text: "The agent's actual answer goes here.",
    audioUrl: "/audio/answer.wav", // optional; same origin or CORS-enabled
  },
}))
```

With an audio URL, Web Audio volume drives the jaw and mouth interior. Text alone uses the browser's installed speech voice with approximate mouth movement. Audio autoplay may require user interaction. Neither mode currently provides phoneme-level visemes. `mouthFunnel` and `mouthSmile` are available for a future viseme driver. Stop cancels playback and closes the mouth.

This checkout has no conversational agent backend. The companion includes a voice preview and the response event bridge; it does not invent agent answers. Connect the existing harness's response/voice stream to the event above for automatic spoken replies. Microphone transcription and a custom cloned voice are not configured.

## Sources

- [Meshy image-to-3d API](https://docs.meshy.ai/en/api/image-to-3d)
- [Meshy rigging API](https://docs.meshy.ai/en/api/rigging)

Browser QA uses a real WebGL renderer, desktop and mobile viewports, walking/pause, real Web Audio playback and speech transport. Headless voice transport checks do not establish audible OS voice quality. Blender verification reimports both GLBs and renders the jaw closed/open and a walking frame.

The exports pass glTF validation with zero errors. The validator reports non-root skinned-node warnings for Blender's armature hierarchy; rendering and deformation were checked in Blender and Three.js. The mouth interior also has unused UV/tangent informational messages. TypeScript and the production Next.js build pass. Chrome QA at 1440×1000 and 390×844 passed with no browser errors; Playwright was used because the Browser plugin was not available.
