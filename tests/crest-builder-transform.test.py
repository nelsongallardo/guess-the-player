import importlib.util
import unittest
from pathlib import Path

from PIL import Image

MODULE_PATH = Path(__file__).parents[1] / "research" / "player-addition-batch10" / "crest_image.py"
spec = importlib.util.spec_from_file_location("crest_image", MODULE_PATH)
assert spec is not None and spec.loader is not None
crest_image = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crest_image)


class FitCrestTests(unittest.TestCase):
    def test_upscales_small_authentic_crop_to_fill_128_canvas(self):
        source = Image.new("RGBA", (21, 17), (255, 0, 0, 255))
        result = crest_image.fit_crest(source)
        self.assertEqual(result.size, (128, 128))
        alpha = result.getchannel("A").getbbox()
        self.assertIsNotNone(alpha)
        self.assertEqual(max(alpha[2] - alpha[0], alpha[3] - alpha[1]), 128)

    def test_downscales_large_source_without_distorting_aspect_ratio(self):
        source = Image.new("RGBA", (512, 256), (0, 0, 255, 255))
        result = crest_image.fit_crest(source)
        self.assertEqual(result.size, (128, 128))
        self.assertEqual(result.getchannel("A").getbbox(), (0, 32, 128, 96))


if __name__ == "__main__":
    unittest.main()
