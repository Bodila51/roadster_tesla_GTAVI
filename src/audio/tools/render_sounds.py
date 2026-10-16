"""Render the Roadster v2 sound set offline.

usage: python render_sounds.py OUT_WAV_DIR PUBLIC_SOUNDS_DIR MANIFEST_JS [only1,only2]

Every sound is synthesised here (no recordings). Loops are built periodic (or
crossfaded) and wrap-padded so the engine can loop any window of the loop
length, which keeps MP3 encoder delay from ever producing a gap.
"""
import json
import os
import subprocess
import sys

import numpy as np

from dsp import (SR, TAU, add_reverb, bp, bump, click, db, env_ad, eq, fade, fm_tone, gen_ir, hp,
                 jet_psd, loudness, lp, mallet, modal, norm_lufs, norm_peak, pad_loop, pan, place,
                 plfo, pnoise, reson, rms, saturate, smoothstep, softclip, spec_shape, stft_shape,
                 svf_sweep, to_stereo, tt, undb, widen)

PAD = 0.12  # wrap padding (s) around every loop
SOUNDS = {}


def sound(name, kind, **meta):
    def deco(fn):
        SOUNDS[name] = dict(fn=fn, kind=kind, **meta)
        return fn
    return deco


def ptone(n, f_mean, rng, fm=None, sr=SR):
    """Periodic sine over n samples; mean frequency snapped to whole cycles."""
    L = n / sr
    cyc = max(1, round(f_mean * L))
    f0 = cyc / L
    inst = f0 * (1.0 + (fm if fm is not None else 0.0))
    inst = inst - (np.mean(inst) - f0)
    ph = TAU * np.cumsum(inst) / sr + rng.uniform(0, TAU)
    return ph


def pfilt(fn, x):
    """Steady-state (periodic) result of a causal filter on a periodic signal."""
    n = len(x)
    y = fn(np.concatenate([x, x, x], axis=0))
    return y[2 * n:3 * n]


def circ_conv(x, h):
    n = len(x)
    return np.fft.irfft(np.fft.rfft(x, axis=0) * np.fft.rfft(h, n, axis=0)[(slice(None),) + (None,) * (x.ndim - 1)], n, axis=0)


def poisson_impulses(n, rate, rng, amp_sigma=0.6):
    x = np.zeros(n)
    k = rng.poisson(rate * n / SR)
    idx = rng.integers(0, n, k)
    x[idx] += rng.lognormal(0, amp_sigma, k) * rng.choice([-1, 1], k)
    return x


def ticks(n, times, rng, f_lo, f_hi, q=(4, 10), dec=(0.0006, 0.002), amps=None, stereo=True, pans=None):
    """Scatter of tiny resonant ticks (debris, grit). Returns stereo or mono."""
    out = np.zeros((n, 2)) if stereo else np.zeros(n)
    tk = tt(0.03)
    for i, t0 in enumerate(times):
        f = np.exp(rng.uniform(np.log(f_lo), np.log(f_hi)))
        d = rng.uniform(*dec)
        burst = rng.standard_normal(len(tk)) * np.exp(-tk / d)
        s = reson(burst, f, rng.uniform(*q))
        s /= (np.max(np.abs(s)) + 1e-9)
        a = amps[i] if amps is not None else 1.0
        if stereo:
            p = pans[i] if pans is not None else rng.uniform(-0.8, 0.8)
            place(out, pan(s, p), t0, a)
        else:
            place(out, s, t0, a)
    return out


UI_IR_CACHE = {}


def ui_ir(rng_seed=7, dur=1.3, rt_lo=1.0, rt_hi=0.55):
    key = (rng_seed, dur, rt_lo, rt_hi)
    if key not in UI_IR_CACHE:
        rng = np.random.default_rng(rng_seed)
        early = [(0.011, 0.5, -0.4), (0.017, 0.4, 0.5), (0.023, 0.3, -0.2), (0.031, 0.25, 0.3)]
        UI_IR_CACHE[key] = gen_ir(dur, rt_lo, rt_hi, rng, predelay=0.006, early=early, damp_hi=11000)
    return UI_IR_CACHE[key]


# ---------------------------------------------------------------- loops ----
@sound('tyre_roll', 'loop', L=3.2, stereo=True, lufs=-18)
def tyre_roll(rng):
    """Tyre/road noise on smooth concrete at ~25 m/s (stereo: left/right tyres)."""
    n = int(3.2 * SR)

    def body(seed_rng):
        main = pnoise(n, lambda f: spec_shape(f, lo=380, hi=1250, n_lo=1.5, n_hi=1.6) * bump(f, 930, 1.1, 4)
                      * bump(f, 2600, 2.0, -2), seed_rng)
        grain = 1 + 0.22 * plfo(n, 45, seed_rng) + 0.12 * plfo(n, 260, seed_rng)
        cav = pnoise(n, lambda f: bump(f, 228, 7, 18) * spec_shape(f, lo=150, hi=320, n_lo=2, n_hi=2), seed_rng)
        rumble = pnoise(n, lambda f: spec_shape(f, lo=32, hi=130, n_lo=2, n_hi=2), seed_rng)
        rumble *= 1 + 0.45 * plfo(n, 3.0, seed_rng)
        grit = poisson_impulses(n, 420, seed_rng)
        hk = tt(0.004)
        h = seed_rng.standard_normal(len(hk)) * np.exp(-hk / 0.0006)
        grit = pfilt(lambda v: bp(v, 2200, 7500, 2), circ_conv(grit, h))
        grit /= rms(grit)
        return main * grain + 0.20 * cav + 0.32 * rumble + 0.075 * grit

    common = body(rng)
    l = 0.8 * common + 0.6 * body(rng)
    r = 0.8 * common + 0.6 * body(rng)
    return np.stack([l, r], 1)


@sound('tyre_deck', 'loop', L=2.4, stereo=False, lufs=-18)
def tyre_deck(rng):
    """Rolling on the steel/composite ramp structures: brighter tread + hollow deck boom + panel seams."""
    n = int(2.4 * SR)
    main = pnoise(n, lambda f: spec_shape(f, lo=520, hi=2100, n_lo=1.4, n_hi=1.5) * bump(f, 1500, 1.5, 3), rng)
    main *= 1 + 0.15 * plfo(n, 70, rng)
    drive = pnoise(n, lambda f: spec_shape(f, lo=40, hi=400, n_lo=1, n_hi=2), rng)
    boom = np.zeros(n)
    for f0, q, g in [(74, 9, 1.0), (117, 8, 0.8), (166, 7, 0.6), (243, 6, 0.45), (338, 6, 0.3)]:
        boom += g * pfilt(lambda v: reson(v, f0, q), drive)
    boom /= rms(boom)
    seams = np.zeros(n)
    t = tt(0.25)
    for k in range(3):
        t0 = (k + 0.3) * 0.8
        for dt_ax, g in [(0.0, 1.0), (0.108, 0.8)]:  # front then rear axle over the seam
            th = (np.sin(TAU * 88 * t) * np.exp(-t / 0.035) + 0.5 * np.sin(TAU * 205 * t) * np.exp(-t / 0.02)
                  + 0.35 * click(t, 760, 3, rng, 0.006))
            i = int((t0 + dt_ax) * SR)
            seg = th * g
            idx = (np.arange(len(seg)) + i) % n
            seams[idx] += seg
    seams /= np.max(np.abs(seams))
    return main + 0.55 * boom + 0.9 * seams * rms(main) * 3.0


@sound('squeal', 'loop', L=2.6, stereo=False, lufs=-18)
def squeal(rng):
    """Stick-slip tyre squeal: wandering fundamental, inharmonic belt mode, chatter, scrub breath."""
    n = int(2.6 * SR)
    fm = 0.032 * plfo(n, 1.6, rng) + 0.011 * plfo(n, 9, rng) + 0.004 * plfo(n, 90, rng)
    ph = ptone(n, 905, rng, fm)
    tone = np.sin(ph) + undb(-9) * np.sin(2 * ph + 0.7) + undb(-17) * np.sin(3 * ph + 1.9)
    belt = np.sin(ptone(n, 905 * 1.37, rng, fm * 0.8))
    tone = tone + undb(-12) * belt
    chatter = np.clip(0.66 + 0.36 * plfo(n, 28, rng), 0.28, 1.3)
    swell = np.clip(0.75 + 0.35 * plfo(n, 1.8, rng), 0.25, 1.2)
    tone = softclip(tone * chatter * swell * 0.8, 1.6)
    breath = pnoise(n, lambda f: spec_shape(f, lo=800, hi=3800, n_lo=2, n_hi=2), rng) * chatter
    y = tone + undb(-15) * breath * rms(tone)
    return pfilt(lambda v: eq(v, 'peak', 1800, 1.0, 2.5), y)


@sound('scrub', 'loop', L=2.0, stereo=False, lufs=-18)
def scrub(rng):
    """Sliding rubber roar with stick-slip shudder."""
    n = int(2.0 * SR)
    roar = pnoise(n, lambda f: spec_shape(f, lo=420, hi=2400, n_lo=1.5, n_hi=1.4) * bump(f, 1150, 1.3, 3), rng)
    shud = np.abs(1 + 0.55 * plfo(n, 55, rng)) * (1 + 0.25 * plfo(n, 6, rng))
    low = pnoise(n, lambda f: spec_shape(f, lo=55, hi=170, n_lo=2, n_hi=2), rng) * (1 + 0.5 * plfo(n, 14, rng))
    return roar * shud + 0.45 * low


@sound('wind', 'loop', L=6.4, stereo=True, lufs=-18)
def wind(rng):
    """Turbulent airflow around the body at speed: gusts, buffeting, faint edge whistle."""
    n = int(6.4 * SR)

    def ch(r):
        base = pnoise(n, lambda f: spec_shape(f, lo=70, hi=850, n_lo=1, n_hi=1.05) * bump(f, 1600, 0.8, 2.5), r)
        gust = 1 + 0.28 * plfo(n, 0.45, r)
        bright = pnoise(n, lambda f: spec_shape(f, lo=1800, hi=7000, n_lo=2, n_hi=1.5), r)
        bgain = np.clip(0.5 + 0.5 * plfo(n, 0.6, r), 0, 1.5)
        buff = pnoise(n, lambda f: spec_shape(f, lo=18, hi=75, n_lo=2, n_hi=2), r) * (1 + 0.6 * plfo(n, 2.5, r))
        return base * gust + 0.28 * bright * bgain * gust + 0.55 * buff

    common = ch(rng)
    l = 0.7 * common + 0.7 * ch(rng)
    r = 0.7 * common + 0.7 * ch(rng)
    whis = pnoise(n, lambda f: bump(f, 1930, 30, 30) * spec_shape(f, lo=1500, hi=2500, n_lo=3, n_hi=3), rng)
    whis *= np.clip(plfo(n, 0.35, rng), 0, None) * 0.05
    return np.stack([l + whis, r + 0.7 * whis], 1)


@sound('jet_lift', 'loop', L=3.0, stereo=True, lufs=-18)
def jet_lift(rng):
    """Four underbody cold-gas (N2) jets: broad jet-mixing hiss with shock bump, gentle turbulence."""
    n = int(3.0 * SR)
    out = np.zeros((n, 2))
    pans_ = [-0.65, -0.22, 0.22, 0.65]
    for j in range(4):
        fp = 2900 * (1 + 0.09 * (j - 1.5) / 1.5)
        hiss = pnoise(n, lambda f: np.sqrt(jet_psd(f, fp)) * bump(f, 7500, 2.0, 2.0)
                      * spec_shape(f, lo=320, hi=13000, n_lo=2, n_hi=2), rng)
        turb = 1 + 0.07 * plfo(n, 110, rng) + 0.05 * plfo(n, 2.5, rng)
        out += pan(hiss * turb, pans_[j])
    low = pnoise(n, lambda f: spec_shape(f, lo=90, hi=480, n_lo=2, n_hi=2) * bump(f, 160, 1.2, 3), rng)
    low *= 1 + 0.3 * plfo(n, 7, rng)
    out += to_stereo(0.22 * low)
    return out


@sound('jet_rumble', 'loop', L=3.0, stereo=False, lufs=-18)
def jet_rumble(rng):
    """Turbulent vapour rumble under the car: churning low end plus a low-mid roar (with harmonics for phones)."""
    n = int(3.0 * SR)
    churn = pnoise(n, lambda f: spec_shape(f, lo=28, hi=210, n_lo=2, n_hi=2) * bump(f, 62, 1.4, 3), rng)
    am = 0.62 + 0.38 * np.tanh(1.6 * plfo(n, 5.0, rng))
    roar = pnoise(n, lambda f: spec_shape(f, lo=210, hi=760, n_lo=2, n_hi=2), rng) * (1 + 0.35 * plfo(n, 9, rng))
    y = churn * am + 0.5 * roar
    y = saturate(y / (np.max(np.abs(y)) + 1e-9) * 1.0, 2.2)
    return pfilt(lambda v: hp(v, 24, 2), y)


@sound('jet_rear', 'loop', L=3.0, stereo=True, lufs=-18)
def jet_rear(rng):
    """Two rear thrust nozzles: lower, rougher roar with shock crackle and a faint screech."""
    n = int(3.0 * SR)
    out = np.zeros((n, 2))
    for j, (fp, p) in enumerate([(1600, -0.45), (1780, 0.45)]):
        roar = pnoise(n, lambda f: np.sqrt(jet_psd(f, fp)) * bump(f, 900, 1.2, 4.5)
                      * spec_shape(f, lo=230, hi=12000, n_lo=2, n_hi=2), rng)
        turb = 1 + 0.11 * plfo(n, 80, rng) + 0.06 * plfo(n, 3, rng)
        crack = poisson_impulses(n, 70, rng, 0.9)
        hk = tt(0.003)
        crack = circ_conv(crack, rng.standard_normal(len(hk)) * np.exp(-hk / 0.00035))
        crack = pfilt(lambda v: hp(v, 2500, 2), crack)
        crack /= rms(crack) + 1e-9
        scr_fm = 0.006 * plfo(n, 5, rng)
        scr = np.sin(ptone(n, 1720 * (1 + 0.04 * j), rng, scr_fm)) * np.clip(0.6 + 0.6 * plfo(n, 3, rng), 0, None)
        out += pan(roar * turb + 0.22 * crack + 0.07 * scr, p)
    return out


@sound('fan', 'loop', L=2.0, stereo=False, lufs=-18)
def fan(rng):
    """Two ducted suction fans at full speed: blade-pass tones (with broadening), shaft orders, duct rush."""
    n = int(2.0 * SR)
    y = np.zeros(n)
    for bpf, g in [(1650.0, 1.0), (1660.0, 0.85)]:
        fm = 0.0025 * plfo(n, 12, rng)
        ph = ptone(n, bpf, rng, fm)
        am = 1 + 0.35 * plfo(n, 160, rng)
        y += g * am * (np.sin(ph) + undb(-9) * np.sin(2 * ph + 1.1) + undb(-17) * np.sin(3 * ph + 0.4))
        shaft = bpf / 9
        y += g * undb(-20) * np.sin(ptone(n, shaft, rng, fm)) + g * undb(-24) * np.sin(ptone(n, 2 * shaft, rng, fm))
    rush = pnoise(n, lambda f: spec_shape(f, lo=260, hi=2800, n_lo=1.5, n_hi=1.3) * bump(f, 1080, 2, 4)
                  * bump(f, 3300, 3, 2), rng)
    rush *= 1 + 0.08 * plfo(n, 40, rng)
    return 0.55 * y / rms(y) + rush


@sound('ambience', 'loop', L=11.0, stereo=True, lufs=-30)
def ambience(rng):
    """Open test site on a hot afternoon: soft moving air, distant cicada chorus, far-off road hum."""
    n = int(11.0 * SR)

    def ch(r):
        air = pnoise(n, lambda f: spec_shape(f, lo=60, hi=700, n_lo=1, n_hi=1.2), r) * (1 + 0.35 * plfo(n, 0.18, r))
        return air

    air_c = ch(rng)
    l = 0.6 * air_c + 0.8 * ch(rng)
    r_ = 0.6 * air_c + 0.8 * ch(rng)
    cic = np.zeros((n, 2))
    for k in range(5):
        fc = rng.uniform(4400, 6200)
        band = pnoise(n, lambda f: bump(f, fc, 4, 24) * spec_shape(f, lo=3200, hi=8000, n_lo=3, n_hi=3), rng)
        rate = rng.uniform(150, 230)
        pulse = 0.5 + 0.5 * np.sin(ptone(n, rate, rng, 0.02 * plfo(n, 2, rng)))
        swell = np.clip(0.4 + 0.7 * plfo(n, 0.12, rng), 0, None) ** 1.5
        cic += pan(band * pulse ** 2 * swell, rng.uniform(-0.8, 0.8))
    cic /= rms(cic) + 1e-9
    hum = pnoise(n, lambda f: spec_shape(f, lo=70, hi=260, n_lo=2, n_hi=2), rng) * (1 + 0.2 * plfo(n, 0.2, rng))
    base = np.stack([l, r_], 1)
    base /= rms(base)
    return base + 0.10 * cic + to_stereo(0.25 * hum)


# --------------------------------------------------------- thrusters -------
def _jet_noise(n, fp, rng, lo=300, hi=13000):
    return pnoise(n, lambda f: np.sqrt(jet_psd(f, fp)) * spec_shape(f, lo=lo, hi=hi, n_lo=2, n_hi=2), rng)


def _valve(t, rng, f1=3100, f2=5200, thunk=190, g=1.0):
    return g * (0.7 * click(t, f1, 14, rng, 0.012) + 0.45 * click(t, f2, 18, rng, 0.008)
                + 0.9 * np.sin(TAU * thunk * t) * np.exp(-t / 0.011))


def _lift_burst(rng, ground=True, dur=1.25, seed_shift=0):
    t = tt(dur)
    n = len(t)
    valve = _valve(t, rng)
    onset = 0.003
    bright = _jet_noise(n, 4700, rng, lo=900)
    steady = _jet_noise(n, 2900, rng)
    tb = np.maximum(t - onset, 0)
    a = np.where(t < onset, 0, np.minimum(1, tb / 0.004))
    e_bright = a * np.exp(-tb / 0.045)
    e_steady = a * (0.55 + 0.45 * np.exp(-tb / 0.08)) * np.exp(-np.maximum(tb - 0.35, 0) / 0.32)
    turb = 1 + 0.09 * plfo(n, 90, rng)
    hiss = (1.05 * bright * e_bright + 0.7 * steady * e_steady) * turb
    hissL = hiss
    hissR = (1.05 * _jet_noise(n, 4500, rng, lo=900) * e_bright + 0.7 * _jet_noise(n, 2800, rng) * e_steady) * turb
    st = np.stack([hissL, hissR], 1)
    if ground:
        sweep = 92 * np.exp(-t / 0.18) + 40
        whump = np.sin(TAU * np.cumsum(sweep) / SR) * env_ad(np.maximum(t - 0.004, 0), 0.006, 0.085) * (t > 0.004)
        whump = saturate(whump, 2.4)
        boom = lp(rng.standard_normal(n), 260, 2) * env_ad(np.maximum(t - 0.004, 0), 0.004, 0.06) * (t > 0.004)
        boom /= np.max(np.abs(boom)) + 1e-9
        st += to_stereo(0.95 * whump + 0.55 * boom)
        times = 0.02 + rng.gamma(1.3, 0.09, 34)
        times = times[times < 0.6]
        amps = 0.35 * np.exp(-times / 0.25) * rng.uniform(0.3, 1.0, len(times))
        st += 0.35 * ticks(n, times, rng, 2500, 9000, amps=amps)
    bloom = pnoise(n, lambda f: spec_shape(f, lo=500, hi=2600, n_lo=2, n_hi=1.5), rng)
    bloom *= env_ad(np.maximum(t - 0.02, 0), 0.05, 0.28) * (1 + 0.3 * plfo(n, 12, rng))
    st += to_stereo(0.28 * bloom)
    st += to_stereo(0.55 * valve)
    st = widen(st, rng, 0.25)
    return fade(st, 0, 0.12)


@sound('lift_burst_a', 'shot', stereo=True)
def lift_burst_a(rng):
    return _lift_burst(rng, True)


@sound('lift_burst_b', 'shot', stereo=True)
def lift_burst_b(rng):
    return _lift_burst(rng, True, dur=1.15)


@sound('lift_open', 'shot', stereo=True)
def lift_open(rng):
    """Valves opening in the air: crack + pressure onset, no ground blast."""
    return _lift_burst(rng, False, dur=0.6)


def _tail(rng, fp0, fp1, dur, valve_f=(2600, 4400), thunk=160, pop=False):
    t = tt(dur)
    n = len(t)
    w = np.stack([rng.standard_normal(n), rng.standard_normal(n)], 1)

    def g(tm, f):
        fp = fp1 + (fp0 - fp1) * np.exp(-tm / 0.2)
        amp = np.exp(-tm / 0.085) + 0.22 * np.exp(-tm / 0.34)
        return np.sqrt(jet_psd(f, fp)) * amp * spec_shape(f, lo=180, hi=13000, n_lo=2, n_hi=2)

    y = np.stack([stft_shape(w[:, c], g, nfft=512, hop=128) for c in range(2)], 1)
    y /= np.max(np.abs(y)) + 1e-9
    v = _valve(np.maximum(t - 0.008, 0), rng, valve_f[0], valve_f[1], thunk, 0.5) * (t > 0.008)
    sigh = pnoise(n, lambda f: spec_shape(f, lo=280, hi=1400, n_lo=2, n_hi=1.5), rng)
    sigh *= env_ad(t, 0.03, 0.28)
    out = y + to_stereo(0.4 * v + 0.18 * sigh / (np.max(np.abs(sigh)) + 1e-9))
    if pop:
        out += to_stereo(0.4 * np.sin(TAU * 95 * t) * env_ad(t, 0.003, 0.03))
    return fade(out, 0.002, 0.1)


@sound('lift_tail', 'shot', stereo=True)
def lift_tail(rng):
    return _tail(rng, 2900, 650, 0.85)


@sound('rear_burst', 'shot', stereo=True)
def rear_burst(rng):
    """Rear thrust opening: heavy valve thump, roar that climbs as flow establishes, push whoomp."""
    t = tt(1.0)
    n = len(t)
    w = np.stack([rng.standard_normal(n), rng.standard_normal(n)], 1)

    def g(tm, f):
        fp = 950 + 700 * smoothstep(tm, 0.0, 0.09)
        amp = np.minimum(1, tm / 0.008) * (0.62 + 0.75 * np.exp(-tm / 0.07)) * np.exp(-np.maximum(tm - 0.32, 0) / 0.3)
        return np.sqrt(jet_psd(f, fp)) * bump(f, 900, 1.2, 4) * amp * spec_shape(f, lo=200, hi=14000, n_lo=2, n_hi=3)

    roar = np.stack([stft_shape(w[:, c], g, nfft=512, hop=64) for c in range(2)], 1)
    roar /= np.max(np.abs(roar)) + 1e-9
    v = _valve(t, rng, 1900, 3400, 120, 1.0)
    push = saturate(np.sin(TAU * (66 * t + 8 * t * t)) * env_ad(t, 0.01, 0.12), 2.0)
    times = rng.uniform(0.01, 0.18, 26)
    crack = ticks(n, times, rng, 3000, 9000, q=(1, 3), dec=(0.0002, 0.0006), amps=rng.uniform(0.2, 0.7, 26))
    out = roar + to_stereo(0.5 * v + 0.75 * push) + 0.5 * crack
    return fade(widen(out, rng, 0.2), 0, 0.15)


@sound('rear_tail', 'shot', stereo=True)
def rear_tail(rng):
    return _tail(rng, 1650, 420, 0.8, valve_f=(1800, 3100), thunk=110, pop=True)


def _rcs(rng):
    dur = rng.uniform(0.11, 0.16)
    t = tt(dur)
    n = len(t)
    fp = rng.uniform(3300, 4800)
    hiss = _jet_noise(n, fp, rng, lo=1200) * env_ad(t, 0.0015, rng.uniform(0.016, 0.032))
    v = click(t, rng.uniform(2600, 4600), 10, rng, 0.004)
    puff = np.sin(TAU * rng.uniform(170, 260) * t) * env_ad(t, 0.002, 0.012)
    y = hiss + 0.35 * v / (np.max(np.abs(v)) + 1e-9) + 0.25 * puff
    return fade(y, 0, 0.02)


for _k in range(4):
    sound(f'rcs_{_k + 1}', 'shot', stereo=False)(lambda rng, _k=_k: _rcs(rng))


# ------------------------------------------------------------ impacts ------
def _thump(t, f0, f1, glide, att, dec, drive):
    fr = f1 + (f0 - f1) * np.exp(-t / glide)
    s = np.sin(TAU * np.cumsum(fr) / SR) * env_ad(t, att, dec)
    return saturate(s, drive)


def _pk(x):
    return x / (np.max(np.abs(x)) + 1e-9)


def _land(rng, hard=False):
    """Landing on all four tyres. Low weight for headphones, chassis knocks and tyre slap for phones."""
    if not hard:
        t = tt(0.8)
        n = len(t)
        th = _thump(t, 96, 58, 0.06, 0.002, 0.07, 3.5)
        h2 = np.sin(TAU * np.cumsum(2 * (58 + 38 * np.exp(-t / 0.06))) / SR + 0.4) * env_ad(t, 0.002, 0.045)
        knock = _pk(modal(t, [235, 372, 598, 905, 1390, 2150], [0.22, 0.19, 0.15, 0.12, 0.09, 0.07],
                          [0.8, 1, 0.8, 0.55, 0.35, 0.2], rng, 0.06))
        slap = _pk(bp(rng.standard_normal(n), 300, 2400, 2) * env_ad(t, 0.0012, 0.03))
        ch_f = 1180 - 120 * smoothstep(t, 0, 0.05)
        chirp = np.sin(TAU * np.cumsum(ch_f) / SR) * env_ad(np.maximum(t - 0.006, 0), 0.003, 0.035) * (t > 0.006)
        puff = _pk(bp(rng.standard_normal(n), 250, 900, 2) * env_ad(t, 0.004, 0.05))
        y = 0.62 * th + 0.25 * h2 + 0.95 * knock + 0.6 * slap + 0.2 * chirp + 0.3 * puff
        st = to_stereo(y)
        times = 0.02 + rng.gamma(1.2, 0.05, 12)
        keep = times < 0.4
        st += 0.12 * ticks(n, times[keep], rng, 2000, 6500, amps=rng.uniform(0.3, 1, 12)[keep])
        return fade(st, 0, 0.15)
    t = tt(1.5)
    n = len(t)
    y = 0.75 * _thump(t, 74, 36, 0.09, 0.002, 0.14, 3.8)
    y += 0.45 * np.sin(TAU * 31 * t) * env_ad(t, 0.004, 0.22)
    y += 0.3 * np.sin(TAU * np.cumsum(2 * (36 + 38 * np.exp(-t / 0.09))) / SR) * env_ad(t, 0.002, 0.09)
    boom = _pk(bp(rng.standard_normal(n), 180, 520, 2) * env_ad(t, 0.003, 0.11))
    y += 0.7 * boom
    clank = _pk(modal(t, [410, 690, 1130, 1720, 2580, 3410], [0.32, 0.26, 0.2, 0.15, 0.11, 0.08],
                      [1, 0.8, 0.6, 0.45, 0.3, 0.2], rng, 0.05))
    y += 0.75 * clank * (0.45 + 0.55 * np.exp(-t / 0.05))
    knock = _pk(modal(t, [205, 330, 540, 820, 1240], [0.3, 0.26, 0.2, 0.15, 0.1], [0.8, 1, 0.7, 0.45, 0.25], rng, 0.05))
    y += 0.85 * knock
    crack = _pk(hp(rng.standard_normal(n), 1500, 2) * env_ad(np.maximum(t - 0.004, 0), 0.0005, 0.006) * (t > 0.004))
    y += 0.45 * crack
    crunch = _pk(bp(rng.standard_normal(n), 400, 2500, 2) * env_ad(t, 0.001, 0.03))
    y += 0.35 * crunch
    squash = _pk(lp(rng.standard_normal(n), 700, 2) * env_ad(t, 0.002, 0.045))
    y += 0.35 * squash
    rebound = _thump(np.maximum(t - 0.19, 0), 60, 44, 0.05, 0.004, 0.07, 3) * (t > 0.19)
    rb_knock = _pk(modal(np.maximum(t - 0.19, 0), [260, 470, 760], [0.06, 0.05, 0.04], [1, 0.6, 0.3], rng)) * (t > 0.19)
    y += 0.32 * rebound + 0.18 * rb_knock
    ch_f = 1080 - 140 * smoothstep(t, 0, 0.08)
    y += 0.2 * np.sin(TAU * np.cumsum(ch_f) / SR) * env_ad(t, 0.003, 0.04)
    st = to_stereo(y)
    times = 0.04 + rng.gamma(1.4, 0.16, 46)
    keep = times < 1.2
    amps = 0.5 * np.exp(-times[keep] / 0.4) * rng.uniform(0.2, 1.0, np.sum(keep))
    st += 0.32 * ticks(n, times[keep], rng, 1800, 9000, amps=amps)
    creak = bp(rng.standard_normal(n), 900, 2400, 2) * (np.clip(np.sin(TAU * 31 * t), 0, None) ** 4)
    st += to_stereo(0.06 * creak * env_ad(np.maximum(t - 0.08, 0), 0.05, 0.12) * (t > 0.08))
    return fade(widen(st, rng, 0.15), 0, 0.25)


@sound('land_soft_a', 'shot', stereo=True)
def land_soft_a(rng):
    return _land(rng, False)


@sound('land_soft_b', 'shot', stereo=True)
def land_soft_b(rng):
    return _land(rng, False)


@sound('land_hard_a', 'shot', stereo=True)
def land_hard_a(rng):
    return _land(rng, True)


@sound('land_hard_b', 'shot', stereo=True)
def land_hard_b(rng):
    return _land(rng, True)


def _crash(rng, heavy=True):
    """Carbon tub + aluminium hitting concrete: crunch, splinter crackle, crumple modes, grind, tumble, debris."""
    dur = 1.9 if heavy else 1.4
    t = tt(dur)
    n = len(t)
    k = 1.0 if heavy else 0.7
    burst = softclip(rng.standard_normal(n) * env_ad(t, 0.0008, 0.012) * 3, 2.5)
    y = 0.75 * burst
    y += 0.9 * _thump(t, 66, 34, 0.08, 0.002, 0.15 * k + 0.03, 3.8)
    y += 0.25 * np.sin(TAU * np.cumsum(2 * (34 + 32 * np.exp(-t / 0.08))) / SR) * env_ad(t, 0.002, 0.08)
    crunch = _pk(bp(rng.standard_normal(n), 280, 2200, 2) * env_ad(t, 0.002, 0.06))
    y += 0.95 * crunch
    body = _pk(modal(t, [190, 310, 455, 640], [0.2, 0.16, 0.12, 0.1], [1, 0.8, 0.6, 0.4], rng, 0.06))
    y += 0.4 * body * k
    metal = _pk(modal(t, rng.uniform(280, 3200, 9), rng.uniform(0.08, 0.28, 9), rng.uniform(0.3, 1.0, 9)))
    y += 0.4 * metal * k
    grind_env = smoothstep(t, 0.03, 0.09) * np.exp(-np.maximum(t - 0.12, 0) / (0.3 * k + 0.1))
    grind = _pk(bp(rng.standard_normal(n), 800, 4200, 2) * np.abs(1 + 0.8 * plfo(n, 70, rng)) * grind_env)
    y += 0.4 * grind
    for t0, g in ([(0.33, 0.55), (0.61, 0.35)] if heavy else [(0.29, 0.45)]):
        tb = np.maximum(t - t0, 0)
        hit = _thump(tb, 82, 50, 0.04, 0.003, 0.06, 3) + 0.6 * _pk(modal(tb, [230, 390, 610], [0.07, 0.05, 0.04], [1, .6, .35], rng))
        y += g * (t > t0) * hit
    st = to_stereo(y)
    nc = 44 if heavy else 26
    ct = rng.gamma(1.1, 0.07, nc)
    ct = ct[ct < 0.45]
    st += 0.6 * ticks(n, ct, rng, 1400, 8000, q=(3, 8), dec=(0.0004, 0.0015), amps=rng.uniform(0.3, 1.0, len(ct)))
    for t0 in rng.uniform(0.1, 0.7, 3 if heavy else 2):
        tb = np.maximum(t - t0, 0)
        f = rng.uniform(2800, 6200)
        tk = modal(tb, [f, f * 2.71], [0.35, 0.18], [1, 0.4], rng) * (t > t0) * np.minimum(1, tb / 0.0005)
        st += pan(0.12 * tk, rng.uniform(-0.7, 0.7))
    nd = 70 if heavy else 40
    dt_ = 0.12 + rng.gamma(1.3, 0.3, nd)
    dt_ = dt_[dt_ < dur - 0.2]
    amps = 0.45 * np.exp(-(dt_ - 0.12) / 0.5) * rng.uniform(0.15, 1.0, len(dt_))
    st += 0.42 * ticks(n, dt_, rng, 900, 7000, q=(2, 9), amps=amps)
    return fade(widen(st, rng, 0.25), 0, 0.3)


@sound('crash_a', 'shot', stereo=True)
def crash_a(rng):
    return _crash(rng, True)


@sound('crash_b', 'shot', stereo=True)
def crash_b(rng):
    return _crash(rng, False)


def _scrape(rng, dur):
    t = tt(dur)
    n = len(t)
    env = np.minimum(1, t / 0.008) * np.exp(-np.maximum(t - dur * 0.35, 0) / (dur * 0.25))
    fr = rng.uniform(900, 1300)
    grind = bp(rng.standard_normal(n), fr, fr * 4.5, 2)
    grind *= np.abs(1 + 0.75 * plfo(n, rng.uniform(55, 95), rng)) * env
    grind = _pk(grind)
    modes = np.zeros(n)
    for _ in range(4):
        modes += reson(grind, rng.uniform(1100, 3600), rng.uniform(18, 35))
    modes = _pk(modes)
    thud = np.sin(TAU * rng.uniform(95, 130) * t) * env_ad(t, 0.002, 0.02)
    knock = _pk(modal(t, [rng.uniform(260, 340), rng.uniform(480, 620)], [0.05, 0.04], [1, 0.6], rng))
    y = grind + 0.35 * modes + 0.45 * thud + 0.35 * knock + 0.3 * click(t, rng.uniform(1800, 3000), 4, rng, 0.004)
    return fade(y, 0, 0.06)


@sound('scrape_a', 'shot', stereo=False)
def scrape_a(rng):
    return _scrape(rng, 0.42)


@sound('scrape_b', 'shot', stereo=False)
def scrape_b(rng):
    return _scrape(rng, 0.58)


@sound('scrape_c', 'shot', stereo=False)
def scrape_c(rng):
    return _scrape(rng, 0.34)


# ------------------------------------------------------------ moments ------
@sound('launch', 'shot', stereo=True)
def launch(rng):
    """Standstill launch: drivetrain take-up clunk, torque surge, tyres biting, air shove."""
    t = tt(1.5)
    n = len(t)
    clunk = _pk(modal(t, [180, 640, 1450, 2300], [0.09, 0.06, 0.04, 0.03], [1, 0.7, 0.4, 0.2], rng))
    sf = 38 + 26 * smoothstep(t, 0.02, 0.55)
    surge_env = smoothstep(t, 0.0, 0.07) * np.exp(-np.maximum(t - 0.35, 0) / 0.42)
    surge = saturate(np.sin(TAU * np.cumsum(sf) / SR), 3.0) * surge_env
    thrum = np.zeros(n)
    f0 = 92 + 30 * smoothstep(t, 0, 0.8)
    ph = TAU * np.cumsum(f0) / SR
    for kk in range(1, 10):
        thrum += np.sin(kk * ph + rng.uniform(0, TAU)) / kk ** 0.9
    grit = lp(rng.standard_normal(n), 30, 2)
    thrum *= (1 + 0.3 * _pk(grit)) * smoothstep(t, 0, 0.05) * np.exp(-t / 0.45)
    bite_f = 1320 - 330 * smoothstep(t, 0.0, 0.16)
    bph = TAU * np.cumsum(bite_f) / SR
    bite = np.sin(bph) * env_ad(t, 0.004, 0.08) + 0.4 * np.sin(2 * bph) * env_ad(t, 0.004, 0.05)
    scrubn = _pk(bp(rng.standard_normal(n), 500, 3000, 2) * env_ad(t, 0.004, 0.12))
    air = _pk(svf_sweep(rng.standard_normal(n), 380 + 2300 * smoothstep(t, 0.1, 1.2), 1.2)
              * smoothstep(t, 0.05, 0.5) * np.exp(-np.maximum(t - 0.6, 0) / 0.3))
    y = 0.6 * clunk + 0.6 * surge + 0.55 * _pk(thrum) + 0.42 * bite + 0.35 * scrubn + 0.25 * air
    return fade(widen(to_stereo(y), rng, 0.2), 0, 0.2)


# ------------------------------------------------------------- UI kit ------
def bell(t, f, rng, ratio=3.0, index=2.0, t_idx=0.05, t_amp=0.3, detune_c=2.0, att=0.002):
    """FM glass/metal bell with a slightly detuned twin for shimmer."""
    idx = index * np.exp(-t / t_idx) + 0.15 * index
    amp = np.minimum(1, t / att) * np.exp(-t / t_amp)
    a = fm_tone(t, f, ratio, idx, amp)
    b = fm_tone(t, f * 2 ** (detune_c / 1200), ratio, idx * 0.8, amp)
    return 0.6 * a + 0.4 * b


def epiano(t, f, rng, t_amp=0.5, index=1.3):
    idx = index * np.exp(-t / 0.15) + 0.1
    amp = np.minimum(1, t / 0.004) * np.exp(-t / t_amp)
    return fm_tone(t, f, 1.0, idx, amp) + 0.25 * fm_tone(t, f * 2, 1.0, idx * 0.5, amp * np.exp(-t / 0.2))


def sheen(t, rng, t0=0.0, dur=0.12, lo=6000):
    n = len(t)
    s = hp(rng.standard_normal(n), lo, 2) * env_ad(np.maximum(t - t0, 0), dur * 0.3, dur * 0.6) * (t >= t0)
    return _pk(s)


def zip_up(t, rng, t0, dur, f0=900, f1=6500):
    n = len(t)
    tb = np.clip((t - t0) / dur, 0, 1)
    fc = f0 * (f1 / f0) ** tb
    return _pk(svf_sweep(rng.standard_normal(n), fc, 3.0) * np.sin(np.pi * tb) ** 2)


def at(t, t0):
    """Time axis shifted to start at t0 (zero before), plus the gate."""
    return np.maximum(t - t0, 0), (t >= t0)


def ui_finish(st, rng, wet=0.2, fo=0.3, ir=None):
    """Bake the small bright UI room in; the dry part was synthesised at full length so nothing truncates."""
    ir = ui_ir() if ir is None else ir
    y = add_reverb(to_stereo(st), ir, wet, 0)
    return fade(y, 0, fo)


NOTE = {'D5': 587.33, 'E5': 659.26, 'F#5': 739.99, 'A5': 880.0, 'B5': 987.77, 'C#6': 1108.73,
        'D6': 1174.66, 'E6': 1318.51, 'F#6': 1479.98, 'A6': 1760.0, 'B6': 1975.53, 'D7': 2349.32,
        'D4': 293.66, 'A4': 440.0, 'C#5': 554.37, 'F#4': 369.99, 'D3': 146.83, 'D2': 73.42, 'A2': 110.0}


def _trick(rng, level):
    """Trick points / combo up: one glass note per trick climbing D-E-F#-A-B, layers added as the combo grows."""
    t = tt(1.15)
    n = len(t)
    stacks = {1: ['D6'], 2: ['E6', 'B5'], 3: ['F#6', 'D6'], 4: ['A6', 'F#6', 'D6'], 5: ['B6', 'A6', 'F#6', 'D6']}[level]
    st = np.zeros((n, 2))
    st += to_stereo(0.25 * _pk(click(t, 3300, 3, rng, 0.003)))
    st += to_stereo(0.22 * mallet(t, 640, 0.4, rng) / 3)
    for i, nm in enumerate(stacks):
        tb, g = at(t, i * 0.014)
        b = bell(tb, NOTE[nm], rng, ratio=3.0 if i == 0 else 2.0, index=2.2 if i == 0 else 1.2,
                 t_idx=0.045, t_amp=0.2 + 0.035 * level) * g
        st += pan(b * (1.0 if i == 0 else 0.55), (i - (len(stacks) - 1) / 2) * 0.3)
    if level >= 3:
        st += to_stereo(0.12 * sheen(t, rng, 0.0, 0.14))
    if level >= 4:
        st += pan(0.16 * zip_up(t, rng, 0.0, 0.09), 0.2)
    if level >= 5:
        st += to_stereo(0.35 * np.sin(TAU * NOTE['D3'] * t) * env_ad(t, 0.003, 0.12))
    return ui_finish(st, rng, wet=0.2, fo=0.35)


for _lv in range(1, 6):
    sound(f'trick_{_lv}', 'shot', stereo=True, ui=True)(lambda rng, _lv=_lv: _trick(rng, _lv))


@sound('bank_s', 'shot', stereo=True, ui=True)
def bank_s(rng):
    """Score banked: soft wooden thock with weight, warm two-note rise, small glint."""
    t = tt(1.25)
    st = np.zeros((len(t), 2))
    st += to_stereo(0.4 * _pk(mallet(t, 230, 0.15, rng)))
    st += to_stereo(0.45 * np.sin(TAU * 110 * t) * env_ad(t, 0.003, 0.06))
    for t0, nm, p in [(0.0, 'A5', -0.2), (0.07, 'D6', 0.2)]:
        tb, g = at(t, t0)
        st += pan(0.55 * epiano(tb, NOTE[nm], rng, 0.32) * g, p)
    tb, g = at(t, 0.07)
    st += to_stereo(0.16 * bell(tb, NOTE['D7'], rng, 3.0, 1.5, 0.03, 0.18) * g)
    return ui_finish(st, rng, wet=0.22, fo=0.4)


@sound('bank_l', 'shot', stereo=True, ui=True)
def bank_l(rng):
    """Big combo banked: sub weight, D major strum, two glass glints."""
    t = tt(1.7)
    st = np.zeros((len(t), 2))
    st += to_stereo(0.4 * _pk(mallet(t, 200, 0.15, rng)))
    st += to_stereo(0.5 * saturate(np.sin(TAU * NOTE['D2'] * t), 2.5) * env_ad(t, 0.003, 0.16))
    st += to_stereo(0.1 * sheen(t, rng, 0.0, 0.12))
    for i, nm in enumerate(['D5', 'F#5', 'A5', 'D6']):
        tb, g = at(t, 0.025 * i)
        st += pan(0.42 * epiano(tb, NOTE[nm], rng, 0.45) * g, -0.45 + 0.3 * i)
    for t0, nm, gg in [(0.11, 'A6', 0.2), (0.14, 'D7', 0.13)]:
        tb, g = at(t, t0)
        st += to_stereo(gg * bell(tb, NOTE[nm], rng, 3.0, 1.6, 0.03, 0.3) * g)
    return ui_finish(st, rng, wet=0.25, fo=0.45)


@sound('mission', 'shot', stereo=True, ui=True)
def mission(rng):
    """Mission complete: sub weight, Dmaj9 bloom, glass ting pair, airy shimmer. ~2 s."""
    t = tt(2.1)
    n = len(t)
    st = np.zeros((n, 2))
    st += to_stereo(0.55 * saturate(np.sin(TAU * NOTE['D2'] * t), 2.5) * env_ad(t, 0.004, 0.3))
    st += to_stereo(0.3 * mallet(t, 300, 0.3, rng) / 3)
    rise = svf_sweep(rng.standard_normal(n), 1500 + 7000 * smoothstep(t, 0, 0.16), 1.5)
    rise *= smoothstep(t, 0, 0.15) * np.exp(-np.maximum(t - 0.16, 0) / 0.05)
    st += to_stereo(0.12 * _pk(rise))
    for i, nm in enumerate(['D4', 'A4', 'C#5', 'E5', 'F#5']):
        tb, g = at(t, 0.018 * i)
        for dc in (-4, 4):
            f = NOTE[nm] * 2 ** (dc / 1200)
            st += pan(0.2 * epiano(tb, f, rng, 0.75, 1.1) * g, (-0.5 + 0.25 * i) * (1 if dc > 0 else -0.6))
    for t0, nm, gg, p in [(0.16, 'D6', 0.36, -0.15), (0.165, 'A6', 0.24, 0.2)]:
        tb, g = at(t, t0)
        st += pan(gg * bell(tb, NOTE[nm], rng, 2.0, 1.4, 0.05, 0.62, 3.0) * g, p)
    sh = hp(rng.standard_normal(n), 5500, 2) * smoothstep(t, 0.12, 0.3) * np.exp(-np.maximum(t - 0.3, 0) / 0.45)
    st += widen(to_stereo(0.05 * _pk(sh)), rng, 0.8)
    return ui_finish(st, rng, wet=0.26, fo=0.5, ir=ui_ir(11, 1.7, 1.4, 0.7))


@sound('sixty', 'shot', stereo=True, ui=True)
def sixty(rng):
    """0-60 telemetry chime: crisp tick, two-tone glass ping, short airy lift."""
    t = tt(1.0)
    n = len(t)
    st = np.zeros((n, 2))
    st += to_stereo(0.22 * _pk(click(t, 4200, 3, rng, 0.003)))
    for t0, nm, gg in [(0.0, 'F#6', 0.5), (0.055, 'A6', 0.42)]:
        tb, g = at(t, t0)
        st += to_stereo(gg * bell(tb, NOTE[nm], rng, 2.0, 1.8, 0.035, 0.2) * g)
    air = svf_sweep(rng.standard_normal(n), 1500 + 5000 * smoothstep(t, 0, 0.25), 1.4) * env_ad(t, 0.08, 0.1)
    st += widen(to_stereo(0.08 * _pk(air)), rng, 0.6)
    return ui_finish(st, rng, wet=0.18, fo=0.35)


@sound('ring', 'shot', stereo=True, ui=True)
def ring(rng):
    """Ring pass: air whoosh through the gate (panned), glass fifth chime, small glints."""
    t = tt(1.6)
    n = len(t)
    tb = np.clip(t / 0.45, 0, 1)
    fc = 520 * (2900 / 520) ** np.sin(np.pi * tb * 0.5) ** 2 * np.where(tb > 0.5, 1 - 0.55 * (tb - 0.5) * 2, 1)
    wh = _pk(svf_sweep(rng.standard_normal(n), fc, 1.3) * np.sin(np.pi * tb) ** 1.5)
    st = pan(0.35 * wh, -0.75 + 1.5 * tb)
    for t0, nm, gg, p in [(0.12, 'D6', 0.4, -0.2), (0.125, 'A6', 0.3, 0.25)]:
        tb2, g = at(t, t0)
        tone = modal(tb2, [NOTE[nm], NOTE[nm] * 2.32, NOTE[nm] * 4.25], [0.95, 0.4, 0.18], [1, 0.22, 0.07], rng)
        st += pan(gg * tone * np.minimum(1, tb2 / 0.002) * g, p)
    st += 0.06 * ticks(n, 0.13 + rng.uniform(0, 0.18, 6), rng, 6000, 10000, q=(8, 14))
    return ui_finish(st, rng, wet=0.24, fo=0.45)


@sound('slowmo_in', 'shot', stereo=True, ui=True)
def slowmo_in(rng):
    """Time dilation in: quick reverse air inhale, deep whomp (with harmonics for phones), muffled tunnel."""
    t = tt(1.1)
    n = len(t)
    inhale_env = np.where(t < 0.14, (t / 0.14) ** 3, np.exp(-(t - 0.14) / 0.02))
    inhale = _pk(svf_sweep(rng.standard_normal(n), 6500 * (1 - 0.75 * smoothstep(t, 0, 0.14)) + 300, 0.9) * inhale_env)
    tb, g = at(t, 0.12)
    wf = 34 + 28 * np.exp(-tb / 0.12)
    wph = TAU * np.cumsum(wf) / SR
    whomp = saturate(np.sin(wph), 3.0) * env_ad(tb, 0.004, 0.3) * g
    whomp2 = (0.5 * np.sin(2 * wph) + 0.3 * np.sin(3 * wph + 0.5) + 0.18 * np.sin(5 * wph)) * env_ad(tb, 0.004, 0.18) * g
    tunnel = _pk(reson(rng.standard_normal(n), 430, 1.6) * env_ad(tb, 0.06, 0.4) * g)
    body = _pk(modal(tb, [330, 510, 790], [0.35, 0.28, 0.2], [1, 0.6, 0.3], rng) * g)
    st = widen(to_stereo(0.4 * inhale), rng, 0.6) + to_stereo(0.6 * whomp + 0.45 * whomp2 + 0.4 * tunnel + 0.35 * body)
    return ui_finish(st, rng, wet=0.15, fo=0.3)


@sound('slowmo_out', 'shot', stereo=True, ui=True)
def slowmo_out(rng):
    """Time snapping back: rising air rush, small low swell."""
    t = tt(1.0)
    n = len(t)
    rush = svf_sweep(rng.standard_normal(n), 260 * (5200 / 260) ** smoothstep(t, 0, 0.45), 1.1)
    rush = _pk(rush * smoothstep(t, 0, 0.26) * np.exp(-np.maximum(t - 0.28, 0) / 0.16))
    sph = TAU * np.cumsum(44 + 30 * smoothstep(t, 0, 0.3)) / SR
    senv = smoothstep(t, 0, 0.2) * np.exp(-np.maximum(t - 0.25, 0) / 0.15)
    sw = (saturate(np.sin(sph), 2.0) + 0.35 * np.sin(2 * sph) + 0.2 * np.sin(3 * sph)) * senv
    st = widen(to_stereo(0.45 * rush), rng, 0.6) + to_stereo(0.4 * sw)
    return ui_finish(st, rng, wet=0.12, fo=0.3)


@sound('ui_click', 'shot', stereo=False, ui=True)
def ui_click(rng):
    """Tactile menu tick: crisp edge, small body, tiny low tok."""
    t = tt(0.07)
    y = (0.5 * _pk(click(t, 2600, 3, rng, 0.003)) + 0.6 * np.sin(TAU * 1450 * t) * env_ad(t, 0.0005, 0.006)
         + 0.5 * np.sin(TAU * 420 * t) * env_ad(t, 0.001, 0.008))
    return fade(y, 0, 0.02)


@sound('ui_confirm', 'shot', stereo=True, ui=True)
def ui_confirm(rng):
    """Start = the car waking up: soft power hum blooming open, rising air, warm 'ready' chime."""
    t = tt(1.6)
    n = len(t)
    st = np.zeros((n, 2))
    hum = np.zeros(n)
    for kk in range(1, 9):
        ek = smoothstep(t, 0.02 * kk, 0.2 + 0.025 * kk) * np.exp(-np.maximum(t - 0.3, 0) / 0.35)
        hum += ek * np.sin(TAU * NOTE['A2'] * kk * t + rng.uniform(0, TAU)) / kk
    st += to_stereo(0.32 * _pk(hum))
    air = svf_sweep(rng.standard_normal(n), 320 * (3600 / 320) ** smoothstep(t, 0, 0.24), 1.2)
    air *= smoothstep(t, 0, 0.2) * np.exp(-np.maximum(t - 0.22, 0) / 0.08)
    st += widen(to_stereo(0.12 * _pk(air)), rng, 0.6)
    for t0, nm, gg, p in [(0.2, 'A5', 0.3, -0.2), (0.2, 'D6', 0.42, 0.15)]:
        tb, g = at(t, t0)
        st += pan(gg * bell(tb, NOTE[nm], rng, 2.0, 1.2, 0.05, 0.45) * g, p)
    return ui_finish(st, rng, wet=0.22, fo=0.45)


def _pause(rng, up):
    t = tt(0.55)
    n = len(t)
    st = np.zeros((n, 2))
    fs = (1450, 2150) if up else (2150, 1450)
    for i, f in enumerate(fs):
        tb, g = at(t, 0.055 * i)
        c = (np.sin(TAU * f * tb) * env_ad(tb, 0.0005, 0.007) + 0.4 * np.sin(TAU * f * 0.29 * tb) * env_ad(tb, 0.001, 0.01)) * g
        st += pan(0.5 * c, -0.15 + 0.3 * i)
    fc = (300 * (4200 / 300) ** smoothstep(t, 0, 0.3)) if up else (4200 * (300 / 4200) ** smoothstep(t, 0, 0.3))
    wh = svf_sweep(rng.standard_normal(n), fc, 1.0) * np.sin(np.pi * np.clip(t / 0.34, 0, 1)) ** 2
    st += widen(to_stereo(0.12 * _pk(wh)), rng, 0.5)
    return ui_finish(st, rng, wet=0.15, fo=0.2)


@sound('ui_pause', 'shot', stereo=True, ui=True)
def ui_pause(rng):
    return _pause(rng, False)


@sound('ui_resume', 'shot', stereo=True, ui=True)
def ui_resume(rng):
    return _pause(rng, True)


@sound('whoosh', 'shot', stereo=True)
def whoosh(rng):
    t = tt(0.85)
    n = len(t)
    tb = np.clip(t / 0.75, 0, 1)
    fc = 300 * (2300 / 300) ** np.sin(np.pi * tb) ** 1.4
    w = _pk(svf_sweep(rng.standard_normal(n), fc, 1.0) * np.sin(np.pi * tb) ** 2)
    return fade(pan(w, -0.8 + 1.6 * tb), 0, 0.08)


# ----------------------------------------------------------- pipeline ------
def write_wav(path, x):
    import wave
    x = to_stereo(x) if x.ndim == 2 else x
    ch = 1 if x.ndim == 1 else 2
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


def encode(wav, mp3, stereo, kbps):
    cmd = ['ffmpeg', '-v', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', f'{kbps}k',
           '-ac', '2' if stereo else '1', '-ar', str(SR), mp3]
    subprocess.run(cmd, check=True)


def main():
    out_wav, out_pub, manifest_js = sys.argv[1:4]
    only = set(sys.argv[4].split(',')) if len(sys.argv) > 4 and sys.argv[4] else None
    os.makedirs(out_wav, exist_ok=True)
    os.makedirs(out_pub, exist_ok=True)
    report = {}
    man_path = os.path.join(out_wav, 'manifest.json')
    if os.path.exists(man_path):
        report = json.load(open(man_path))
    for seed, (name, spec) in enumerate(SOUNDS.items()):
        if only and name not in only:
            continue
        rng = np.random.default_rng(1000 + seed * 17)
        x = np.asarray(spec['fn'](rng), dtype=float)
        if spec['stereo'] and x.ndim == 1:
            x = to_stereo(x)
        if not spec['stereo'] and x.ndim == 2:
            x = x.mean(1)
        if spec['kind'] == 'loop':
            x = norm_lufs(x, spec.get('lufs', -18))
            if np.max(np.abs(x)) > undb(-1):
                x = norm_peak(x, -1)
            meas = loudness(x)
            body = x
            x = pad_loop(x, PAD)
            loop = [PAD, PAD + spec['L']]
        else:
            x = x * undb(-1.5 - loudness(x)['tp_db'])
            meas = loudness(x)
            loop = None
        wav = os.path.join(out_wav, name + '.wav')
        write_wav(wav, x)
        kbps = (112 if spec['stereo'] else 64) if spec['kind'] == 'loop' else (128 if spec['stereo'] else 80)
        if name == 'ambience':
            kbps = 80
        mp3 = os.path.join(out_pub, name + '.mp3')
        encode(wav, mp3, spec['stereo'], kbps)
        report[name] = dict(kind=spec['kind'], stereo=spec['stereo'], ui=bool(spec.get('ui')), loop=loop,
                            dur=round(len(x) / SR, 4), lufs=round(meas['lufs'], 2), m_max=round(meas['m_max'], 2),
                            peak=round(meas['peak_db'], 2), tp=round(meas['tp_db'], 2),
                            bytes=os.path.getsize(mp3))
        print(f"{name:14s} {spec['kind']:5s} dur {report[name]['dur']:5.2f}s  LUFS {meas['lufs']:6.1f}  "
              f"Mmax {meas['m_max']:6.1f}  pk {meas['peak_db']:5.1f}  tp {meas['tp_db']:5.1f}  {report[name]['bytes'] / 1024:6.1f} KB")
    json.dump(report, open(man_path, 'w'), indent=1)
    total = sum(v['bytes'] for v in report.values())
    print(f'total {total / 1024:.1f} KB in {len(report)} files')
    lines = ['// Generated by src/audio/tools/render_sounds.py. Do not edit by hand.',
             '// name: [file, loopStart, loopEnd, loudness LUFS, channels]', 'export const SOUND_FILES = {']
    for name in SOUNDS:
        if name not in report:
            continue
        r = report[name]
        ls, le = (r['loop'] if r['loop'] else (0, 0))
        lines.append(f"  {name}: ['{name}.mp3', {ls:.4f}, {le:.4f}, {r['lufs']:.1f}, {2 if r['stereo'] else 1}],")
    lines.append('};')
    open(manifest_js, 'w').write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
