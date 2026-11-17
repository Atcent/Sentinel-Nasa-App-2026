// Sounds are synthesized in the browser with Web Audio (no audio files). Code developed with AI assistance (ChatGPT/Codex by OpenAI).
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const preferenceKey = 'salud-de-mision/audio/v1';
  const controls = { toggle: $('sound-toggle'), volume: $('sound-volume'), output: $('sound-volume-value'), ambient: $('sound-ambient'), test: $('sound-test'), status: $('sound-status') };
  let context, master, enabled = false, busy = false, visible = false, ambientNodes = null, last = null;
  let volume = 35, ambiance = true, sceneDay = 0, lastReview = -Infinity, lastHito = -Infinity;
  const environments = {
    cabin: { label: 'Cabina · ventilación suave', level: .045, cutoff: 350, hum: 78, air: 117 },
    launch: { label: 'Despegue · motores y vibración', level: .18, cutoff: 850, hum: 46, air: 65 },
    orbit: { label: 'Órbita · cabina tranquila', level: .035, cutoff: 300, hum: 78, air: 117 },
    eva: { label: 'EVA · escotilla y ventilación', level: .035, cutoff: 580, hum: 78, air: 117 },
    reentry: { label: 'Reentrada · turbulencia y vibración', level: .14, cutoff: 1050, hum: 58, air: 65 },
    finish: { label: 'Cierre · cabina en reposo', level: .022, cutoff: 240, hum: 78, air: 117 }
  };
  function environmentForDay(day) { return day === 1 ? 'launch' : day === 90 ? 'eva' : day >= 118 && day < 120 ? 'reentry' : day === 120 ? 'finish' : day >= 2 ? 'orbit' : 'cabin'; }
  const voices = new Set();
  const milestoneDays = [0, 1, 2, 3, 14, 30, 42, 55, 70, 90, 118, 120];
  const presets = {
    click: [[620, 0, .045, .045]],
    saved: [[660, 0, .1, .1], [880, .12, .17, .09]],
    review: [[520, 0, .16, .12], [520, .24, .2, .1]],
    missing: [[440, 0, .14, .09], [330, .2, .18, .08]],
    milestone: [[392, 0, .13, .09], [523.25, .16, .18, .085]],
    launch: [[196, 0, .14, .085], [293.66, .16, .14, .095], [392, .32, .24, .1]],
    orbit: [[523.25, 0, .16, .09], [783.99, .2, .24, .085]],
    return: [[587.33, 0, .15, .09], [440, .18, .15, .085], [293.66, .36, .24, .075]],
    finish: [[523.25, 0, .16, .09], [659.25, .18, .16, .09], [783.99, .36, .3, .085]]
  };
  try {
    const saved = JSON.parse(localStorage.getItem(preferenceKey) || 'null');
    if (saved && typeof saved.volume === 'number' && Number.isFinite(saved.volume)) volume = Math.max(0, Math.min(100, Math.round(saved.volume)));
    if (saved && typeof saved.ambiance === 'boolean') ambiance = saved.ambiance;
  } catch { /* Audio preferences must never interrupt the mission. */ }

  function paint(message) {
    controls.toggle.textContent = busy ? 'Activando sonido…' : enabled ? 'Silenciar sonido' : 'Activar sonido';
    controls.toggle.disabled = busy;
    controls.toggle.setAttribute('aria-pressed', String(enabled));
    controls.volume.value = String(volume);
    controls.output.textContent = volume + ' %';
    controls.ambient.checked = ambiance;
    controls.test.disabled = !enabled || volume === 0;
    controls.status.textContent = message || (!enabled ? 'Sonido apagado. Activá el audio cuando quieras.' : volume === 0 ? 'Volumen en cero.' : ambiance && visible ? 'Ambiente: ' + environments[environmentForDay(sceneDay)].label + '.' : 'Sonidos activos · ambiente ' + (ambiance ? 'disponible al entrar a la misión.' : 'apagado.'));
  }
  function savePreferences() {
    try { localStorage.setItem(preferenceKey, JSON.stringify({ volume, ambiance })); } catch { /* Settings still work for this session. */ }
  }
  function disconnect(nodes) { nodes.forEach(node => { try { node.disconnect(); } catch {} }); }
  function clearVoices() {
    for (const voice of voices) {
      try { voice.gain.gain.cancelScheduledValues(context.currentTime); voice.gain.gain.setTargetAtTime(0, context.currentTime, .01); voice.source.stop(context.currentTime + .04); } catch {}
    }
    voices.clear();
  }
  function stopAmbience() {
    if (!ambientNodes) return;
    const old = ambientNodes; ambientNodes = null;
    old.fadeGains.forEach(gain => { gain.gain.cancelScheduledValues(context.currentTime); gain.gain.setTargetAtTime(0, context.currentTime, .025); });
    old.sources.forEach(source => { try { source.stop(context.currentTime + .12); } catch {} });
    setTimeout(() => disconnect(old.nodes), 180);
  }
  function syncAmbience() {
    if (!enabled || !visible || !ambiance || volume === 0 || document.hidden || context?.state !== 'running') { stopAmbience(); return; }
    const scene = environmentForDay(sceneDay), settings = environments[scene];
    if (ambientNodes?.scene === scene) return;
    stopAmbience();
    const gain = context.createGain(), filter = context.createBiquadFilter();
    gain.gain.setValueAtTime(0, context.currentTime); gain.gain.setTargetAtTime(settings.level, context.currentTime, .45);
    filter.type = 'lowpass'; filter.frequency.value = settings.cutoff; filter.Q.value = .35;
    const buffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate), data = buffer.getChannelData(0);
    let seed = 73;
    for (let i = 0; i < data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const time = i / context.sampleRate;
      // Smooth repeating gusts are part of the fictional sound design, not health readings.
      const gust = scene === 'reentry' ? .35 + .65 * Math.pow(Math.sin(Math.PI * time / 2), 8) : scene === 'launch' ? .5 + .5 * Math.pow(Math.sin(Math.PI * time / 3), 4) : .4;
      data[i] = (seed / 4294967296 * 2 - 1) * gust;
    }
    const noise = context.createBufferSource(); noise.buffer = buffer; noise.loop = true; noise.connect(filter);
    const hum = context.createOscillator(), humGain = context.createGain(); hum.type = 'sine'; hum.frequency.value = settings.hum; humGain.gain.value = .12; hum.connect(humGain); humGain.connect(filter);
    const air = context.createOscillator(), airGain = context.createGain(); air.type = 'sine'; air.frequency.value = settings.air; airGain.gain.value = .055; air.connect(airGain); airGain.connect(filter);
    filter.connect(gain); gain.connect(master);
    ambientNodes = { scene, gain, fadeGains: [gain], sources: [noise, hum, air], nodes: [noise, hum, air, humGain, airGain, filter, gain] };
    if (scene === 'launch' || scene === 'reentry') {
      const vibration = context.createOscillator(), vibrationGain = context.createGain();
      vibration.frequency.value = scene === 'launch' ? 7 : 5;
      vibrationGain.gain.value = .045;
      vibration.connect(vibrationGain); vibrationGain.connect(humGain.gain);
      ambientNodes.sources.push(vibration); ambientNodes.nodes.push(vibration, vibrationGain);
    }
    ambientNodes.sources.forEach(source => source.start());
    if (scene === 'eva') airlock(ambientNodes);
  }
  function airlock(group) {
    const at = context.currentTime;
    const hiss = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    hiss.buffer = group.sources[0].buffer; filter.type = 'bandpass'; filter.frequency.value = 1700; filter.Q.value = .6;
    gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.065, at + .2); gain.gain.exponentialRampToValueAtTime(.0001, at + 1.4);
    hiss.connect(filter); filter.connect(gain); gain.connect(master);
    group.sources.push(hiss); group.nodes.push(hiss, filter, gain); group.fadeGains.push(gain);
    hiss.start(at); hiss.stop(at + 1.5);
    for (const delay of [0, 1.4]) {
      const latch = context.createOscillator(), latchGain = context.createGain(); latch.type = 'triangle'; latch.frequency.value = 130;
      latchGain.gain.setValueAtTime(0, at + delay); latchGain.gain.linearRampToValueAtTime(.04, at + delay + .012); latchGain.gain.exponentialRampToValueAtTime(.0001, at + delay + .14);
      latch.connect(latchGain); latchGain.connect(master); group.sources.push(latch); group.nodes.push(latch, latchGain); group.fadeGains.push(latchGain);
      latch.start(at + delay); latch.stop(at + delay + .18);
    }
  }
  function cue(name) {
    if (!enabled || volume === 0 || document.hidden || context?.state !== 'running' || !presets[name]) return;
    try {
      clearVoices();
      const start = context.currentTime + .012;
      for (const [frequency, delay, duration, level] of presets[name]) {
        const source = context.createOscillator(), gain = context.createGain(), at = start + delay;
        source.type = 'sine'; source.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(level, at + .012); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
        source.connect(gain); gain.connect(master);
        const voice = { source, gain }; voices.add(voice);
        source.onended = () => { disconnect([source, gain]); voices.delete(voice); };
        source.start(at); source.stop(at + duration + .025);
      }
    } catch { disable('No se pudo reproducir el audio. La misión sigue disponible.'); }
  }
  function disable(message) {
    enabled = false; clearVoices(); stopAmbience();
    if (context) { master.gain.setValueAtTime(0, context.currentTime); context.suspend().catch(() => {}); }
    paint(message);
  }
  async function toggle() {
    if (busy) return;
    if (enabled) { disable(); return; }
    busy = true; paint();
    try {
      if (!context) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) throw Error('unsupported');
        context = new Audio(); master = context.createGain(); master.gain.value = 0;
        const limiter = context.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.knee.value = 12; limiter.ratio.value = 8;
        master.connect(limiter); limiter.connect(context.destination);
      }
      await context.resume();
      if (context.state !== 'running') throw Error('suspended');
      enabled = true; master.gain.setTargetAtTime(volume / 100 * .65, context.currentTime, .03);
      syncAmbience(); paint(); cue('saved');
    } catch { disable('El navegador no pudo activar el sonido. Intentá de nuevo con este botón.'); }
    finally { busy = false; paint(controls.status.textContent); }
  }
  function view(isVisible) { visible = Boolean(isVisible); if (!visible) { last = null; clearVoices(); } syncAmbience(); paint(); }
  function update(next) {
    const wasVisible = visible;
    sceneDay = Number.isInteger(next.day) && next.day >= 0 && next.day <= 120 ? next.day : 0;
    visible = Boolean(next.visible);
    syncAmbience();
    if (!visible) { last = null; paint(); return; }
    const previous = wasVisible ? last : null;
    const changedProfile = !previous || previous.crew !== next.crew || previous.scenario !== next.scenario;
    const kindChanged = changedProfile || previous.kind !== next.kind;
    const now = context?.currentTime ?? 0;
    const review = kindChanged && (next.kind === 'alert' || next.kind === 'review');
    if (review && enabled && now - lastReview >= 3) { cue(next.kind === 'alert' ? 'review' : 'missing'); lastReview = now; }
    else if (previous && previous.day !== next.day && !changedProfile) {
      // Forward playback may skip a milestone at 3× or 8×. Sound the latest crossed hito once.
      const reached = next.day > previous.day ? milestoneDays.filter(day => day > previous.day && day <= next.day).at(-1) : milestoneDays.includes(next.day) ? next.day : undefined;
      if (reached !== undefined && enabled && now - lastHito >= .4) { cue(reached === 1 ? 'launch' : reached === 2 ? 'orbit' : reached === 118 ? 'return' : reached === 120 ? 'finish' : 'milestone'); lastHito = now; }
    }
    last = { ...next }; paint();
  }
  controls.toggle.addEventListener('click', toggle);
  controls.volume.addEventListener('input', () => {
    volume = Math.max(0, Math.min(100, Number(controls.volume.value) || 0));
    if (context) master.gain.setTargetAtTime(enabled ? volume / 100 * .65 : 0, context.currentTime, .03);
    if (volume === 0) clearVoices();
    syncAmbience(); savePreferences(); paint();
  });
  controls.ambient.addEventListener('change', () => { ambiance = controls.ambient.checked; syncAmbience(); savePreferences(); paint(); });
  controls.test.addEventListener('click', () => cue('milestone'));
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button || button.disabled || button.closest('#sound-controls') || button.dataset.checkin || ['save', 'save-decision', 'person-note-add', 'project-save'].includes(button.id)) return;
    cue('click');
  }, true);
  document.addEventListener('change', event => { if (event.target.matches?.('select, input[type="checkbox"]') && !event.target.closest('#sound-controls')) cue('click'); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearVoices(); stopAmbience(); if (context) context.suspend().catch(() => {}); }
    else if (enabled && context) context.resume().then(() => { syncAmbience(); paint(); }).catch(() => disable('Pulsá Activar sonido para continuar con audio.'));
  });
  globalThis.addEventListener('pagehide', () => { clearVoices(); stopAmbience(); if (context) context.suspend().catch(() => {}); });
  globalThis.MissionAudio = Object.freeze({ update, view, cue });
  const bar = $('sound-controls');
  if (bar && typeof ResizeObserver === 'function') {
    const sizeBar = () => document.documentElement.style.setProperty('--sound-bar-height', bar.getBoundingClientRect().height + 'px');
    new ResizeObserver(sizeBar).observe(bar); sizeBar();
  }
  paint();
})();
