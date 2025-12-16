# Video Processing Guide: Invert + Screen Blending

## Overview
The `eye.mp4` video has been processed to:
1. **Invert colors** - Using ffmpeg `negate` filter
2. **Add transparency** - Using chroma key to remove background
3. **Apply screen blending** - Using CSS `mix-blend-mode: screen`

## Processing Script

Run the processing script:
```bash
./scripts/process-eye-video.sh
```

This creates `public/eye-processed.mp4` with:
- Inverted colors
- Alpha channel (transparency)
- Background removed

## CSS Blending Modes

### Method 1: CSS Filter + Blend Mode (Recommended)
```tsx
<video
  className="mix-blend-screen"
  style={{
    mixBlendMode: 'screen',
    filter: 'invert(1)', // Inverts colors
  }}
>
```

**How it works:**
- `filter: invert(1)` - Inverts the video colors
- `mix-blend-mode: screen` - Lightens the video against the background
  - Screen mode: `1 - (1 - A) * (1 - B)`
  - Dark areas become transparent
  - Light areas blend with background

### Method 2: Pre-processed Video with Alpha
```tsx
<video
  src="/eye-processed.mp4"
  className="mix-blend-screen"
  style={{ mixBlendMode: 'screen' }}
>
```

**How it works:**
- Video already has inverted colors and alpha channel
- CSS blend mode further enhances transparency
- Better performance (pre-processed)

## Combining Two Blending Modes

To apply **both invert and screen** for maximum background removal:

```tsx
<video
  className="mix-blend-screen"
  style={{
    mixBlendMode: 'screen',
    filter: 'invert(1) brightness(1.2) contrast(1.1)',
  }}
>
```

**Why this works:**
1. `invert(1)` - Inverts colors (dark becomes light)
2. `brightness(1.2)` - Makes inverted video brighter
3. `contrast(1.1)` - Increases contrast for better separation
4. `mix-blend-mode: screen` - Lightens against background
   - Dark/black areas become fully transparent
   - Light areas blend naturally

## Advanced: Dual Blend Mode Technique

For even better background removal, you can use a wrapper:

```tsx
<div className="relative">
  {/* Background layer */}
  <div className="absolute inset-0 bg-slate-900 mix-blend-screen" />
  
  {/* Video layer */}
  <video
    className="relative mix-blend-screen"
    style={{
      filter: 'invert(1)',
      mixBlendMode: 'screen',
    }}
  >
    <source src="/eye.mp4" type="video/mp4" />
  </video>
</div>
```

## Testing Different Approaches

1. **Original + CSS only**: Use original video with CSS filters
2. **Processed + CSS**: Use processed video with CSS blend mode
3. **Dual blend**: Use wrapper div with multiple blend modes

## Troubleshooting

**Background not transparent enough?**
- Adjust chromakey threshold in script: `chromakey=0x000000:0.15:0.25`
- Increase brightness: `brightness(1.3)`
- Try different blend modes: `multiply`, `overlay`, `soft-light`

**Colors look wrong?**
- Remove `invert(1)` if using pre-processed video
- Adjust contrast: `contrast(0.9)` to `contrast(1.2)`

**Performance issues?**
- Use pre-processed video (smaller file, alpha channel)
- Reduce video resolution if needed
- Use CSS transforms instead of filters when possible

