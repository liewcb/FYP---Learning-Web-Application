"""Optical character recognition for scanned pages and pictures of text."""

from __future__ import annotations

import logging
import time
from collections.abc import Callable
from functools import lru_cache
from importlib.metadata import PackageNotFoundError, version
from typing import Any, Protocol

from PIL import Image


logger = logging.getLogger(__name__)

# Smaller images are icons, bullets or decorations rather than text.
MIN_IMAGE_WIDTH = 120
MIN_IMAGE_HEIGHT = 32
# Larger images are downscaled; OCR time grows with pixel count.
MAX_IMAGE_SIDE = 2_500
# Lines recognised with lower confidence are usually noise.
MIN_LINE_CONFIDENCE = 0.6
# Per-document limits keep processing well inside the 10-minute stale window.
MAX_OCR_IMAGES = 60
OCR_TIME_BUDGET_SECONDS = 240.0


class OcrEngine(Protocol):
    name: str
    version: str

    def read_lines(self, image: Image.Image) -> list[str]:
        """Return recognised text lines in reading order."""
        ...


class RapidOcrEngine:
    """PP-OCR models run locally through ONNX Runtime; no network is used."""

    name = "rapidocr"

    def __init__(self) -> None:
        # Imported here so documents without images never load the models.
        from rapidocr import RapidOCR

        self._engine: Any = RapidOCR()
        self.version = package_version("rapidocr")

    def read_lines(self, image: Image.Image) -> list[str]:
        result = self._engine(image.convert("RGB"))
        texts = result.txts or ()
        scores = result.scores or ()
        return [
            text.strip()
            for text, score in zip(texts, scores)
            if score >= MIN_LINE_CONFIDENCE and text.strip()
        ]


@lru_cache(maxsize=1)
def get_ocr_engine() -> OcrEngine:
    """Load the OCR models once per process, on first use."""

    return RapidOcrEngine()


class OcrSession:
    """OCR for one document, with limits on how many images and how long."""

    def __init__(
        self,
        engine_factory: Callable[[], OcrEngine] = get_ocr_engine,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._engine_factory = engine_factory
        self._engine: OcrEngine | None = None
        self._clock = clock
        self._started_at: float | None = None
        self.images_with_text = 0
        self.images_skipped = 0

    @property
    def used(self) -> bool:
        return self.images_with_text > 0

    @property
    def engine_label(self) -> tuple[str, str]:
        engine = self._engine
        if engine is None:
            return "rapidocr", package_version("rapidocr")
        return engine.name, engine.version

    def read(self, image: Image.Image) -> list[str]:
        if image.width < MIN_IMAGE_WIDTH or image.height < MIN_IMAGE_HEIGHT:
            return []

        if self._started_at is None:
            self._started_at = self._clock()
        out_of_budget = self._clock() - self._started_at > OCR_TIME_BUDGET_SECONDS
        attempted = self.images_with_text + self.images_skipped
        if out_of_budget or attempted >= MAX_OCR_IMAGES:
            self.images_skipped += 1
            return []

        if max(image.size) > MAX_IMAGE_SIDE:
            image = image.copy()
            image.thumbnail((MAX_IMAGE_SIDE, MAX_IMAGE_SIDE))

        try:
            if self._engine is None:
                self._engine = self._engine_factory()
            lines = self._engine.read_lines(image)
        except Exception:
            # One unreadable image must not fail the whole document.
            logger.exception("OCR failed for one image.")
            return []

        if lines:
            self.images_with_text += 1
        return lines

    def warnings(self) -> list[str]:
        warnings: list[str] = []
        if self.images_with_text:
            noun = "image or scanned page" if self.images_with_text == 1 else (
                "images or scanned pages"
            )
            warnings.append(
                f"Text was read from {self.images_with_text} {noun} with OCR, so "
                "it may contain recognition mistakes."
            )
        if self.images_skipped:
            warnings.append(
                f"{self.images_skipped} more images were not read because the OCR "
                "limit for one document was reached."
            )
        return warnings


def package_version(distribution: str) -> str:
    try:
        return version(distribution)
    except PackageNotFoundError:
        return "unknown"
