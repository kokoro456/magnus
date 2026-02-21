// src/utils/SoundManager.ts

class SoundManager {
  private context: AudioContext | null = null;

  constructor() {
    try {
      this.context = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported');
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.5) {
    if (!this.context) return;
    
    // 사용자 인터랙션 이후에만 오디오 컨텍스트 활성화 가능
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    const osc = this.context.createOscillator();
    const gain = this.context.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.context.currentTime);
    
    // Volume Envelope (Attack - Decay)
    gain.gain.setValueAtTime(0, this.context.currentTime);
    gain.gain.linearRampToValueAtTime(vol, this.context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, this.context.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.context.destination);

    osc.start();
    osc.stop(this.context.currentTime + duration);
  }

  // 타격음 (Impact): 둔탁하고 강한 소리
  playImpact() {
    // 저주파 노이즈 + 킥 드럼 느낌
    this.playTone(150, 'square', 0.1, 0.8);
    this.playTone(80, 'sine', 0.15, 1.0);
  }

  // 바운드음 (Bounce): 가볍고 짧은 소리
  playBounce() {
    this.playTone(200, 'triangle', 0.05, 0.4);
  }

  // 득점/타겟 명중 (Score): 맑은 효과음
  playScore() {
    this.playTone(880, 'sine', 0.1, 0.3); // High A
    setTimeout(() => this.playTone(1100, 'sine', 0.2, 0.3), 100); // High C#
  }
}

export const soundManager = new SoundManager();
