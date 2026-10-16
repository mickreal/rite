"""Cut static instances from the variable brand fonts (ffmpeg drawtext only reads a variable font's default
instance, which is ExtraBold for Bricolage and Regular for Hanken). Needs fontTools: pip install fonttools.
Run from anywhere: python3 content/fonts/make-static.py"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = os.path.dirname(os.path.abspath(__file__))
JOBS = [
    ("BricolageGrotesque-VF.ttf", {"wght": 800, "opsz": 96, "wdth": 100}, "BricolageGrotesque-ExtraBold.ttf"),
    ("BricolageGrotesque-VF.ttf", {"wght": 700, "opsz": 48, "wdth": 100}, "BricolageGrotesque-Bold.ttf"),
    ("HankenGrotesk-VF.ttf", {"wght": 600}, "HankenGrotesk-SemiBold.ttf"),
    ("HankenGrotesk-VF.ttf", {"wght": 500}, "HankenGrotesk-Medium.ttf"),
]
for src, axes, dst in JOBS:
    f = instantiateVariableFont(TTFont(os.path.join(HERE, src)), axes, updateFontNames=False)
    f.save(os.path.join(HERE, dst))
    print("wrote", dst)
