#!/usr/bin/env python3
"""Render the original eagle-rank motion films. No services or app data.

Requires ffmpeg, Pillow, numpy and scipy. Run from any directory:
    python3 scripts/render-eagle-film.py --streak 4
The two generated keyframes remain unchanged in source/. All camera movement,
light, particles, type and the original score are composed into the video here.
"""
from pathlib import Path
import argparse
import math
import subprocess
import tempfile
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--streak', type=int, choices=[3, 4, 5], default=3)
STREAK = parser.parse_args().streak
FILM_ID = {3:'three', 4:'four', 5:'five'}[STREAK]
OUT = ROOT / f'assets/celebrations/eagle-{FILM_ID}-v1'
SOURCE = ROOT / 'assets/celebrations/eagle-three-v1/source'
W, H, FPS, SECONDS = 720, 1280, 30, 12
GOLD = (239, 204, 129)
ACCENT = {3:GOLD, 4:(255, 169, 94), 5:(210, 174, 255)}[STREAK]
HITS = {3:[1.5,2.15,2.8], 4:[1.25,1.77,2.29,2.81], 5:[1.08,1.51,1.94,2.37,2.8]}[STREAK]
RNG = np.random.default_rng(317)
PARTICLES = [(float(RNG.uniform(0, W)), float(RNG.uniform(0, H)),
              float(RNG.uniform(12, 44)), float(RNG.uniform(.6, 2.1)),
              float(RNG.uniform(0, 6.28))) for _ in range({3:80, 4:100, 5:120}[STREAK])]


def smooth(x):
    x = max(0., min(1., x))
    return x * x * (3 - 2 * x)


def appear(t, start, duration=.7):
    return smooth((t - start) / duration)


def font(name, size):
    return ImageFont.truetype(str(SOURCE / (name + '.ttf')), size)


def lettering(text, face, spacing=0, metal=True):
    """Vector type mask, with restrained gold foil lighting."""
    boxes = [face.getbbox(c) for c in text]
    advances = [face.getlength(c) for c in text]
    width = int(sum(advances) + spacing * max(0, len(text)-1) + 12)
    height = max(b[3] for b in boxes) - min(b[1] for b in boxes) + 12
    mask = Image.new('L', (width, height))
    draw = ImageDraw.Draw(mask)
    x, y = 6, 6 - min(b[1] for b in boxes)
    for c, advance in zip(text, advances):
        draw.text((x, y), c, font=face, fill=255)
        x += advance + spacing
    if metal:
        stops = [(0, (175, 124, 55)), (.25, (255, 240, 197)),
                 (.46, (216, 174, 97)), (.51, (255, 245, 215)),
                 (.75, (229, 192, 118)), (1, (145, 98, 37))]
        yy = np.linspace(0, 1, height)
        channels = [np.interp(yy, [s[0] for s in stops], [s[1][i] for s in stops]) for i in range(3)]
        rgb = np.tile(np.stack(channels, axis=1)[:, None, :], (1, width, 1)).astype('uint8')
        layer = Image.fromarray(rgb, 'RGB').convert('RGBA')
    else:
        layer = Image.new('RGBA', mask.size, (*GOLD, 255))
    layer.putalpha(mask)
    return layer


TYPE = {
    'brand': lettering('JTFAG', font('Cinzel', 22), 9, False),
    'hall': lettering('HALL OF FAME', font('Cinzel', 12), 5, False),
    'opening': lettering('THE UNBROKEN', font('Cinzel', 25), 5),
    'kicker': lettering({3:'THREE', 4:'FOUR', 5:'FIVE'}[STREAK]+' CONSECUTIVE VICTORIES', font('Cinzel', 10), 2, False),
    'number': lettering(str(STREAK), font('Cinzel', 150)),
    'streak': lettering('연속', font('BlackHanSans', 35)),
    'eagle': lettering('독수리', font('BlackHanSans', 82), 9),
}
EYE = Image.open(SOURCE / 'eagle-eye.png').convert('RGB').resize((W+120, H+214), Image.Resampling.LANCZOS)
HERO = Image.open(SOURCE / 'eagle-hero.png').convert('RGB').resize((W+120, H+214), Image.Resampling.LANCZOS)
YY, XX = np.mgrid[0:H, 0:W]
VIGNETTE = np.clip(1 - .19 * (((XX-W/2)/(W*.7))**2 + ((YY-H*.42)/(H*.8))**2), .65, 1)
HERO_CORE = np.exp(-(((XX-W/2)/(W*.18))**4 + ((YY-H*.36)/(H*.22))**4))


def camera(image, zoom, dx=0, dy=0):
    width, height = W/zoom, H/zoom
    left, top = (image.width-width)/2+dx, (image.height-height)/2+dy
    return image.transform((W, H), Image.Transform.EXTENT,
                           (left, top, left+width, top+height), Image.Resampling.BICUBIC)


def place(canvas, key, y, alpha=1, x=None, scale=1):
    if alpha <= 0:
        return
    layer = TYPE[key]
    if scale != 1:
        layer = layer.resize((int(layer.width*scale), int(layer.height*scale)), Image.Resampling.LANCZOS)
    if alpha < .999:
        layer = layer.copy()
        layer.putalpha(layer.getchannel('A').point(lambda a: int(a*alpha)))
    canvas.alpha_composite(layer, (int((W-layer.width)/2 if x is None else x), int(y-layer.height/2)))


def frame(t):
    transition = appear(t, 3.3, .65)
    if transition < 1:
        a = camera(EYE, 1.0 + .035*t, -8 + t*3, -3*t)
    if transition > 0:
        # Fast arrival settles into a slow, steady cinematic push.
        z = 1.14 - .14*appear(t, 3.3, 1.6) + .018*max(0, t-5)/7
        b = camera(HERO, z, 0, 6-appear(t, 3.3, 2)*6)
    base = b if transition == 1 else a if transition == 0 else Image.blend(a, b, transition)
    exposure = .82 + .18*appear(t, 3.3, 1.8)
    if t < 3.3:
        exposure *= .88
    fade_in = appear(t, .2, 1.1)
    pixels = np.asarray(base, dtype=np.float32)
    pixels *= (VIGNETTE * exposure * fade_in)[:, :, None]
    # Film grading changes the emitted light while keeping dark feathers and
    # neutral ivory detail. The original source keyframes are never modified.
    if STREAK > 3:
        luminance = pixels @ np.array([.2126, .7152, .0722], dtype=np.float32)
        warm = np.clip((pixels[:,:,0]-pixels[:,:,2])/255, 0, 1)
        if STREAK == 4:
            pixels += warm[:,:,None] * np.array([18, -36, -20], dtype=np.float32)
        else:
            light = warm * np.clip((luminance-55)/115, 0, 1) * transition * (1-HERO_CORE)
            pixels += light[:,:,None] * np.array([-20, -40, 350], dtype=np.float32)
    # One soft flare at the cut, then a quieter title impact. No strobing.
    flare = .18*math.exp(-((t-3.72)/.12)**2) + .045*math.exp(-((t-5.65)/.19)**2)
    pixels += np.array({3:[210,156,62], 4:[255,137,48], 5:[183,120,255]}[STREAK], dtype=np.float32) * flare
    image = Image.fromarray(np.clip(pixels, 0, 255).astype('uint8'), 'RGB').convert('RGBA')
    fx = Image.new('RGBA', (W, H))
    d = ImageDraw.Draw(fx)
    strength = appear(t, .4, 1.4)
    for i, (x, y, speed, radius, phase) in enumerate(PARTICLES):
        px = x + 9*math.sin(t*.3+phase)
        py = (y - t*speed) % H
        opacity = int((85+100*math.sin(t*.7+phase)**2)*strength)
        color = (255, 212, 124) if STREAK == 3 or i%3 == 0 else ACCENT
        d.ellipse((px-radius, py-radius, px+radius, py+radius), fill=(*color, opacity))
        if i % 12 == 0:
            d.ellipse((px-5, py-5, px+5, py+5), fill=(244, 166, 48, int(opacity*.12)))
    image.alpha_composite(fx)
    # Gold bloom and a fine impact ripple stay behind the typography.
    pulse = t - 5.65
    if 0 < pulse < 1.15:
        ring = Image.new('RGBA', (W, H)); draw = ImageDraw.Draw(ring)
        r = 60 + 620*(1-(1-pulse/1.15)**2)
        color = (255, 225, 159) if STREAK == 3 else ACCENT
        draw.ellipse((W/2-r, H*.355-r, W/2+r, H*.355+r), outline=(*color, int(80*(1-pulse/1.15))), width=2)
        image.alpha_composite(ring)
    brand_alpha = appear(t, .3, .9)
    place(image, 'brand', 125, brand_alpha)
    place(image, 'hall', 158, brand_alpha*.7)
    if t < 3.5:
        alpha = appear(t, 1.05, .8) * (1-appear(t, 3.0, .4))
        place(image, 'opening', 1014, alpha)
        line = Image.new('RGBA', (W, H)); draw = ImageDraw.Draw(line)
        for i, at in enumerate(HITS):
            x = W/2 + (i-(STREAK-1)/2)*{3:76,4:64,5:55}[STREAK]
            draw.line((x-22, 1075, x+22, 1075), fill=(*GOLD, int(220*appear(t, at, .18)*(1-appear(t, 3.1, .3)))), width=2)
        image.alpha_composite(line)
    place(image, 'kicker', 773, appear(t, 5.1, .8)*.85)
    number_a = appear(t, 5.65, .7)
    # The large numeral and Korean suffix share one deliberately bounded row.
    row_width = TYPE['number'].width + 20 + TYPE['streak'].width
    x = (W-row_width)/2
    place(image, 'number', 872+(1-number_a)*24, number_a, x=x)
    suffix_a = appear(t, 5.95, .7)
    place(image, 'streak', 906+(1-suffix_a)*15, suffix_a, x=x+TYPE['number'].width+20)
    title_a = appear(t, 6.45, .9)
    place(image, 'eagle', 1002+(1-title_a)*20, title_a)
    rule = Image.new('RGBA', (W, H)); draw = ImageDraw.Draw(rule)
    half = 96*appear(t, 7, .8)
    draw.line((W/2-half, 1070, W/2+half, 1070), fill=(*GOLD, int(95*title_a)), width=1)
    image.alpha_composite(rule)
    return image.convert('RGB')


def score(path):
    """Original short fanfare: layered strings, brass, sub drums and air."""
    sr = 48000
    n = int(SECONDS*sr)
    audio = np.zeros((n, 2), dtype=np.float64)
    rng = np.random.default_rng(2026)

    def add(signal, start, gain=1, pan=0):
        offset = int(start*sr)
        length = min(len(signal), n-offset)
        if length <= 0:
            return
        audio[offset:offset+length, 0] += signal[:length]*gain*math.sqrt((1-pan)/2)
        audio[offset:offset+length, 1] += signal[:length]*gain*math.sqrt((1+pan)/2)

    def strings(freq, duration, gain, start, pan):
        t = np.arange(int(duration*sr))/sr
        signal = np.zeros(len(t))
        for detune in [-.003, -.001, .001, .003]:
            phase = 2*np.pi*freq*(1+detune)*t + .035*np.sin(2*np.pi*4.7*t)
            for harmonic in range(1, 8):
                signal += np.sin(phase*harmonic+rng.uniform(0, 6.28))/(harmonic**1.65*4)
        env = np.minimum(t/.9, 1)*np.minimum((duration-t)/1.7, 1)
        env = np.clip(env, 0, 1)
        add(signal*env, start, gain, pan)

    def brass(freq, start, duration, gain, pan=0):
        t = np.arange(int(duration*sr))/sr
        env = np.clip(t/.16, 0, 1)**1.3*np.clip((duration-t)/.65, 0, 1)
        phase = 2*np.pi*freq*t + .009*np.sin(2*np.pi*5*t)
        signal = sum(np.sin(phase*k) * v for k, v in enumerate([0, .5, .5, .37, .22, .12, .07, .03]) if k)
        add(signal*env, start, gain, pan)

    def impact(start, gain):
        t = np.arange(int(2.5*sr))/sr
        phase = 2*np.pi*(39*t + 26*.065*(1-np.exp(-t/.065)))
        drum = np.sin(phase)*np.exp(-t*2.9)
        noise = sosfilt(butter(2, 1200, fs=sr, output='sos'), rng.standard_normal(len(t)))
        drum += noise*.5*np.exp(-t*18)
        add(drum, start, gain)

    strings(73.416, 5.3, .13, 0, 0)
    strings(146.83, 5.3, .05, 0, -.35)
    for freq, pan in [(146.83, -.45), (220, .45), (293.66, -.3), (369.99, .35), (440, -.2), (587.33, .2)]:
        strings(freq, 8.5, .052 if freq < 300 else .034, 3.5, pan)
    gains = {3:[.36,.4,.45], 4:[.3,.36,.4,.45], 5:[.25,.3,.35,.4,.45]}[STREAK]
    for start, gain in list(zip(HITS, gains)) + [(3.68, .9), (5.67, 1), (6.5, .5)]:
        impact(start, gain)
    if STREAK == 4:
        impact(4.8, .22); impact(5.2, .28)
    if STREAK == 5:
        t=np.arange(int(3.8*sr))/sr
        bell=(np.sin(2*np.pi*1174.66*t)+.3*np.sin(2*np.pi*1174.66*2.76*t))*np.exp(-t*1.8)
        add(bell, 5.67, .025, -.3)
    for freq, start, duration, gain in [(220, 3.68, 1.1, .06), (293.66, 4.35, 1.5, .075),
                                        (369.99, 5.15, 1.1, .06), (440, 5.75, 1.2, .055),
                                        (587.33, 6.5, 3.6, .05)]:
        brass(freq, start, duration, gain, -.1)
    brass(146.83, 5.67, 4.3, .05, .2)
    brass(220, 5.67, 4.3, .04, -.2)
    # Reversed air swell, followed by a high metallic wash.
    dur=1.3; t=np.arange(int(dur*sr))/sr
    air=sosfilt(butter(2, [700, 6500], btype='bandpass', fs=sr, output='sos'), rng.standard_normal(len(t)))
    add(air*(t/dur)**3, 2.4, .07, .2)
    for start, gain in [(3.68, .09), (5.67, .11)]:
        t=np.arange(int(3*sr))/sr
        wash=sosfilt(butter(2, 5000, btype='highpass', fs=sr, output='sos'), rng.standard_normal(len(t)))
        add(wash*np.exp(-t*1.9), start, gain, .15)
    # Fixed room echoes produce a broad stereo tail without external samples.
    dry=audio.copy()
    for delay, gain in [(.071,.21),(.113,.17),(.179,.14),(.293,.1),(.419,.075),(.613,.05)]:
        shift=int(delay*sr)
        audio[shift:] += dry[:-shift, ::-1]*gain
    envelope = np.minimum(np.arange(n)/(sr*.2), 1) * np.clip((n-np.arange(n))/(sr*2.0), 0, 1)
    audio *= envelope[:,None]
    audio = np.tanh(audio*1.2)
    audio *= .86/max(.001, np.abs(audio).max())
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(2); wav.setsampwidth(2); wav.setframerate(sr)
        wav.writeframes((audio*32767).astype('<i2').tobytes())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='jtfag-eagle-') as temp:
        temp=Path(temp)
        soundtrack=temp/'score.wav'
        score(soundtrack)
        command=['ffmpeg','-hide_banner','-loglevel','warning','-y',
                 '-f','rawvideo','-pixel_format','rgb24','-video_size',f'{W}x{H}',
                 '-framerate',str(FPS),'-i','pipe:0','-i',str(soundtrack),
                 '-map','0:v:0','-map','1:a:0','-c:v','libx264','-preset','slow',
                 '-crf','23','-profile:v','main','-level','3.1','-pix_fmt','yuv420p',
                 '-af','loudnorm=I=-16:TP=-1.5:LRA=10','-c:a','aac','-b:a','160k',
                 '-ar','48000','-movflags','+faststart','-t',str(SECONDS),
                 '-metadata',f'title=JTFAG — 독수리 {STREAK}연속',
                 '-metadata','comment=Original cinematic motion design and score',
                 str(OUT/f'eagle-{FILM_ID}.mp4')]
        process=subprocess.Popen(command, stdin=subprocess.PIPE)
        try:
            for i in range(FPS*SECONDS):
                process.stdin.write(frame(i/FPS).tobytes())
                if i%FPS==0:
                    print(f'Rendered {i//FPS}/{SECONDS}s', flush=True)
        finally:
            process.stdin.close()
        if process.wait():
            raise RuntimeError('ffmpeg rendering failed')
    frame((FPS*SECONDS-1)/FPS).save(OUT/'poster.jpg', quality=94, subsampling=0)
    print(f'Saved: {OUT / ("eagle-"+FILM_ID+".mp4")}', flush=True)


if __name__=='__main__':
    main()
