"""Spectrogram contact sheets and level tables for rendered sounds.

usage:
  python analyze.py sheet OUT.png file1.wav file2.wav ...   # spectrogram grid
  python analyze.py levels file1.wav ...                      # loudness / peak table
  python analyze.py scenario OUT.png scenario.wav [events.json]  # long spectrogram + loudness curve
"""
import json
import sys

import matplotlib

matplotlib.use('Agg')
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from scipy import signal  # noqa: E402
from scipy.io import wavfile  # noqa: E402

from dsp import loudness  # noqa: E402


def read_wav(path):
    sr, x = wavfile.read(path)
    if x.dtype == np.int16:
        x = x.astype(float) / 32768
    elif x.dtype == np.int32:
        x = x.astype(float) / 2147483648
    else:
        x = x.astype(float)
    return x, sr


def spec_img(ax, x, sr, title, fmax=16000, vmin=-90):
    mono = x if x.ndim == 1 else x.mean(1)
    nper = 1024 if len(mono) > 4096 else 256
    f, t, S = signal.spectrogram(mono, sr, nperseg=nper, noverlap=nper * 3 // 4, window='hann', mode='psd')
    S = 10 * np.log10(S + 1e-14)
    S -= S.max()
    ax.pcolormesh(t, f, np.maximum(S, vmin), shading='auto', cmap='magma', vmin=vmin, vmax=0)
    ax.set_ylim(20, fmax)
    ax.set_yscale('log')
    ax.set_yticks([50, 100, 200, 500, 1000, 2000, 5000, 10000])
    ax.set_yticklabels(['50', '100', '200', '500', '1k', '2k', '5k', '10k'], fontsize=6)
    ax.tick_params(axis='x', labelsize=6)
    ax.set_title(title, fontsize=7)


def sheet(out, files):
    n = len(files)
    cols = 4
    rows = (n + cols - 1) // cols
    fig, axs = plt.subplots(rows, cols, figsize=(cols * 4.2, rows * 2.4), squeeze=False)
    for i, fp in enumerate(files):
        x, sr = read_wav(fp)
        L = loudness(x, sr)
        name = fp.split('/')[-1].replace('.wav', '')
        spec_img(axs[i // cols][i % cols], x, sr, f"{name}  {L['lufs']:.1f} LUFS  pk {L['peak_db']:.1f}  {len(x) / sr:.2f}s")
    for j in range(n, rows * cols):
        axs[j // cols][j % cols].axis('off')
    fig.tight_layout()
    fig.savefig(out, dpi=90)


def phone(x, sr):
    """Crude small-phone-speaker response: steep high-pass around 350 Hz, gentle top roll-off."""
    sos = signal.butter(4, 350 / (sr / 2), 'high', output='sos')
    sos2 = signal.butter(2, 9000 / (sr / 2), 'low', output='sos')
    return signal.sosfilt(sos2, signal.sosfilt(sos, x, axis=0), axis=0)


def levels(files):
    for fp in files:
        x, sr = read_wav(fp)
        L = loudness(x, sr)
        P = loudness(phone(x, sr), sr)
        print(f"{fp.split('/')[-1]:28s} dur {len(x) / sr:6.2f}  LUFS-I {L['lufs']:6.1f}  M-max {L['m_max']:6.1f}  "
              f"peak {L['peak_db']:6.1f}  TP {L['tp_db']:6.1f}  phone M-max {P['m_max']:6.1f} ({P['m_max'] - L['m_max']:+5.1f})")


def ltas(out, files):
    fig, ax = plt.subplots(figsize=(12, 6))
    for fp in files:
        x, sr = read_wav(fp)
        mono = x if x.ndim == 1 else x.mean(1)
        f, P = signal.welch(mono, sr, nperseg=8192)
        # 1/6-octave smoothing
        sm = np.array([P[(f >= fc / 2 ** (1 / 12)) & (f < fc * 2 ** (1 / 12))].mean() if np.any((f >= fc / 2 ** (1 / 12)) & (f < fc * 2 ** (1 / 12))) else np.nan for fc in f[1:]])
        fc = f[1:]
        d = 10 * np.log10(sm * fc + 1e-20)  # per-octave-ish energy (x f) so pink = flat
        ax.semilogx(fc, d - np.nanmax(d), label=fp.split('/')[-1].replace('.wav', ''), lw=1)
    ax.set_xlim(20, 20000)
    ax.set_ylim(-50, 3)
    ax.grid(alpha=0.3, which='both')
    ax.axvspan(20, 350, color='gray', alpha=0.08)
    ax.set_xlabel('Hz (energy per log-frequency band, 0 dB = max; grey = below phone speaker range)')
    ax.legend(fontsize=7, ncol=3)
    fig.tight_layout()
    fig.savefig(out, dpi=80)


def scenario(out, fp, events=None):
    x, sr = read_wav(fp)
    L = loudness(x, sr)
    fig, axs = plt.subplots(3, 1, figsize=(16, 9), sharex=True, gridspec_kw=dict(height_ratios=[3, 1, 1]))
    spec_img(axs[0], x, sr, f"{fp.split('/')[-1]}  LUFS-I {L['lufs']:.1f}  M-max {L['m_max']:.1f}  peak {L['peak_db']:.1f} dBFS  TP {L['tp_db']:.1f}", fmax=18000)
    m = L['momentary']
    axs[1].plot(np.arange(len(m)) * 0.1 + 0.4, m, lw=0.8)
    axs[1].set_ylim(-60, 0)
    axs[1].set_ylabel('M LUFS', fontsize=7)
    axs[1].grid(alpha=0.3)
    mono = np.abs(x if x.ndim == 1 else x.max(1))
    hop = sr // 100
    pk = [20 * np.log10(np.max(mono[i:i + hop]) + 1e-9) for i in range(0, len(mono) - hop, hop)]
    axs[2].plot(np.arange(len(pk)) / 100, pk, lw=0.6, color='crimson')
    axs[2].set_ylim(-60, 3)
    axs[2].axhline(0, color='k', lw=0.5)
    axs[2].set_ylabel('peak dBFS', fontsize=7)
    axs[2].grid(alpha=0.3)
    if events:
        for ev in json.load(open(events)):
            for ax in axs:
                ax.axvline(ev['t'], color='cyan' if ax is axs[0] else 'gray', lw=0.5, alpha=0.6)
            axs[0].text(ev['t'], 25, ev['label'], fontsize=6, color='white', rotation=90, va='bottom')
    fig.tight_layout()
    fig.savefig(out, dpi=80)


if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'sheet':
        sheet(sys.argv[2], sys.argv[3:])
    elif cmd == 'levels':
        levels(sys.argv[2:])
    elif cmd == 'ltas':
        ltas(sys.argv[2], sys.argv[3:])
    elif cmd == 'scenario':
        scenario(sys.argv[2], sys.argv[3], sys.argv[4] if len(sys.argv) > 4 else None)
