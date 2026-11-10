// AudioWorklet: downsample device microphone audio to signed PCM16 at 16 kHz.
// The only transferred data is transient audio, not a stored recording.
class PCM16Processor extends AudioWorkletProcessor {
  constructor(){ super(); this.buf=new Int16Array(640);this.cursor=0;this.phase=0;this.level=0;this.last=0;this.ratio=sampleRate/16000; }
  process(inputs){const ch=inputs[0]?.[0];if(!ch)return true;
    let power=0;
    for(let i=0;i<ch.length;i++){
      const sample=Math.max(-1,Math.min(1,ch[i])); power+=sample*sample;
      this.phase+=1;
      if(this.phase>=this.ratio){this.phase-=this.ratio;this.buf[this.cursor++]=sample<0?Math.round(sample*32768):Math.round(sample*32767);if(this.cursor===this.buf.length){const data=this.buf.buffer;this.port.postMessage({type:'pcm',buffer:data},[data]);this.buf=new Int16Array(640);this.cursor=0;}}
    }
    this.last++;
    if(this.last%8===0)this.port.postMessage({type:'level',level:Math.sqrt(power/ch.length)||0});
    return true;
  }
}
registerProcessor('pcm16-processor',PCM16Processor);
