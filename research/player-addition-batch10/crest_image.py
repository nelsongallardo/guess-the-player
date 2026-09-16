"""Image transforms shared by the reviewed Batch 10 crest builder."""

from PIL import Image


def fit_crest(image: Image.Image, max_size: int = 128) -> Image.Image:
    """Fit a crest to a square canvas, including small authentic crops.

    Small cropped badges are enlarged because leaving their source dimensions
    unchanged would make them nearly invisible once the square asset is drawn
    at the game's 28 px display size. Aspect ratio is always preserved.
    """
    image = image.convert("RGBA")
    width, height = image.size
    if not width or not height:
        raise ValueError("crest image must have non-zero dimensions")

    scale = min(max_size / width, max_size / height)
    target = (max(1, round(width * scale)), max(1, round(height * scale)))
    if target != image.size:
        image = image.resize(target, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (max_size, max_size), (0, 0, 0, 0))
    canvas.alpha_composite(image, ((max_size - image.width) // 2, (max_size - image.height) // 2))
    return canvas
