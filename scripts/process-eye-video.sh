#!/bin/bash
# Process eye.mp4: Invert colors and add transparency for screen blending

INPUT="public/eye.mp4"
OUTPUT="public/eye-processed.mp4"
TEMP_INVERTED="/tmp/eye_inverted.mp4"

echo "🎬 Processing eye.mp4..."

# Step 1: Remove white background (no inversion)
echo "Step 1: Removing white background..."
# Create alpha channel where white/light pixels become transparent
ffmpeg -i "$INPUT" \
  -vf "geq=lum='p(X,Y)':a='if(gt(lum(X,Y),200),0,255)',format=yuva420p" \
  -c:v libx264 \
  -preset medium \
  -crf 23 \
  -pix_fmt yuva420p \
  -y "$OUTPUT" 2>&1 | grep -E "(Duration|frame|error)" || true

# Alternative: More aggressive chroma key for white background
# ffmpeg -i "$TEMP_INVERTED" \
#   -vf "chromakey=0xFFFFFF:0.3:0.4,format=yuva420p" \
#   -c:v libx264 \
#   -preset medium \
#   -crf 23 \
#   -pix_fmt yuva420p \
#   -y "$OUTPUT"

# If chromakey doesn't work well, try alternative method:
# Method 2: Create alpha based on luminance (darker = more transparent)
# ffmpeg -i "$TEMP_INVERTED" \
#   -vf "geq=lum='p(X,Y)':a='if(lt(lum(X,Y),16),0,255)',format=yuva420p" \
#   -c:v libx264 \
#   -preset medium \
#   -crf 23 \
#   -pix_fmt yuva420p \
#   -y "$OUTPUT"

# Cleanup
rm -f "$TEMP_INVERTED"

echo "✅ Processing complete: $OUTPUT"
echo ""
echo "Note: For screen blending mode in CSS, use:"
echo "  mix-blend-mode: screen;"
echo "  or"
echo "  background-blend-mode: screen;"

