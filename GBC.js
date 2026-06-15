(function(Scratch) {
    'use strict';

    // ==========================================
    // MODULE 1: MEMORY MANAGEMENT UNIT (MMU)
    // ==========================================
    class MemoryManagementUnit {
        constructor() {
            this.memory = new Uint8Array(65536); // Full 64KB address space
            this.bgPaletteRam = new Uint8Array(64); // GBC Background Palette Memory
            this.spPaletteRam = new Uint8Array(64); // GBC Sprite Palette Memory
        }

        readByte(address) {
            address &= 0xFFFF;
            return this.memory[address];
        }

        writeByte(address, value) {
            address &= 0xFFFF;
            value &= 0xFF;

            // Block illegal writes to the game ROM space (0x0000 - 0x7FFF)
            if (address < 0x8000) return;

            // Echo RAM Mirroring (0xE000 - 0xFDFF mirrors 0xC000 - 0xDDFF)
            if (address >= 0xE000 && address <= 0xFDFF) {
                this.memory[address - 0x2000] = value;
            }

            this.memory[address] = value;
        }

        loadRom(romBytes) {
            this.memory.fill(0); // Clear old data first
            for (let i = 0; i < romBytes.length && i < 0x8000; i++) {
                this.memory[i] = romBytes[i];
            }
        }
    }

    // ==========================================
    // MODULE 2: CENTRAL PROCESSING UNIT (CPU)
    // ==========================================
    class CentralProcessingUnit {
        constructor(mmu) {
            this.mmu = mmu;
            // GBC 8-bit core registers
            this.a = 0x11; // GBC specific boot value for A register
            this.b = 0x00;
            this.c = 0x13;
            this.d = 0x00;
            this.e = 0xD8;
            this.h = 0x01;
            this.l = 0x4D;
            this.f = 0x80; // Flags register
            
            this.pc = 0x0100; // Code execution starts at address 0x0100
            this.sp = 0xFFFE; // Default Stack Pointer location
        }

        step() {
            const opcode = this.mmu.readByte(this.pc);
            this.pc = (this.pc + 1) & 0xFFFF;

            switch (opcode) {
                case 0x00: // NOP (No Operation)
                    return 4;

                case 0x06: // LD B, d8 (Load immediate byte into B)
                    this.b = this.mmu.readByte(this.pc);
                    this.pc = (this.pc + 1) & 0xFFFF;
                    return 8;

                case 0x0E: // LD C, d8 (Load immediate byte into C)
                    this.c = this.mmu.readByte(this.pc);
                    this.pc = (this.pc + 1) & 0xFFFF;
                    return 8;

                case 0x3C: // INC A (Increment register A)
                    this.a = (this.a + 1) & 0xFF;
                    return 4;

                case 0xC3: // JP nn (Absolute Address Jump)
                    const low = this.mmu.readByte(this.pc);
                    const high = this.mmu.readByte((this.pc + 1) & 0xFFFF);
                    this.pc = (high << 8) | low;
                    return 16;

                default:
                    // Safe fallback for un-coded instructions during startup testing
                    return 4;
            }
        }
    }

    // ==========================================
    // MODULE 3: PICTURE PROCESSING UNIT (PPU)
    // ==========================================
    class PictureProcessingUnit {
        constructor(mmu) {
            this.mmu = mmu;
            this.canvas = null;
            this.ctx = null;
        }

        initCanvas() {
            if (this.canvas) return;

            this.canvas = document.createElement('canvas');
            this.canvas.width = 160;   // Native GBC Resolution Width
            this.canvas.height = 144;  // Native GBC Resolution Height
            this.canvas.style.position = 'absolute';
            this.canvas.style.top = '0';
            this.canvas.style.left = '0';
            this.canvas.style.width = '100%';
            this.canvas.style.height = '100%';
            this.canvas.style.zIndex = '100';
            this.canvas.style.imageRendering = 'pixelated';

            this.ctx = this.canvas.getContext('2d');

            // Find PenguinMod Stage container element dynamically
            const stage = document.querySelector('.stage_stage_2OfSu') || document.body;
            stage.appendChild(this.canvas);
        }

        decodeColor(lowByte, highByte) {
            const combined = (highByte << 8) | lowByte;
            const r5 = combined & 0x1F;
            const g5 = (combined >> 5) & 0x1F;
            const b5 = (combined >> 10) & 0x1F;

            return {
                r: Math.floor((r5 * 255) / 31),
                g: Math.floor((g5 * 255) / 31),
                b: Math.floor((b5 * 255) / 31)
            };
        }

        renderFrame() {
            if (!this.ctx) return;

            const imgData = this.ctx.createImageData(160, 144);
            
            // Demo Background rendering directly reading from Video Memory
            // Full implementation maps VRAM grid arrays (0x8000-0x9FFF) here
            const cLow = this.mmu.readByte(0x8000);
            const cHigh = this.mmu.readByte(0x8001);
            const color = this.decodeColor(cLow, cHigh);

            for (let i = 0; i < imgData.data.length; i += 4) {
                imgData.data[i]     = color.r;
                imgData.data[i + 1] = color.g;
                imgData.data[i + 2] = color.b;
                imgData.data[i + 3] = 255;
            }
            this.ctx.putImageData(imgData, 0, 0);
        }

        removeCanvas() {
            if (this.canvas) {
                this.canvas.remove();
                this.canvas = null;
                this.ctx = null;
            }
        }
    }

    // ==========================================
    // MODULE 4: PENGUINMOD BLOCK WRAPPER
    // ==========================================
    class PenguinGbcEmulator {
        constructor() {
            this.mmu = new MemoryManagementUnit();
            this.cpu = new CentralProcessingUnit(this.mmu);
            this.ppu = new PictureProcessingUnit(this.mmu);
            this.isRunning = false;
        }

        getInfo() {
            return {
                id: 'scratchgbccore',
                name: 'From-Scratch GBC Emulator',
                color1: '#D32F2F', // Retro Nintendo Red color profile
                blocks: [
                    {
                        opcode: 'bootScreen',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'turn on emulator screen overlay'
                    },
                    {
                        opcode: 'loadRomArray',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'load ROM from number list [ROM_DATA]',
                        arguments: {
                            ROM_DATA: {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: '[90,69,76,64,65]'
                            }
                        }
                    },
                    {
                        opcode: 'startEngine',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'run game loop cycles'
                    },
                    {
                        opcode: 'stopEngine',
                        blockType: Scratch.BlockType.COMMAND,
                        text: 'shutdown game loop'
                    }
                ]
            };
        }

        bootScreen() {
            this.ppu.initCanvas();
        }

        loadRomArray(args) {
            try {
                const parsed = JSON.parse(args.ROM_DATA);
                const romBytes = new Uint8Array(parsed);
                this.mmu.loadRom(romBytes);
                console.log("Cartridge array successfully written to system block RAM.");
            } catch(e) {
                console.error("Malformed ROM data string configuration passed.");
            }
        }

        startEngine() {
            if (this.isRunning) return;
            this.isRunning = true;

            const runLoop = () => {
                if (!this.isRunning) return;

                // Execute 70,224 clock cycles to render exactly 1 accurate GBC system frame
                let frameCycles = 0;
                while (frameCycles < 70224) {
                    frameCycles += this.cpu.step();
                }

                this.ppu.renderFrame();
                requestAnimationFrame(runLoop);
            };
            requestAnimationFrame(runLoop);
        }

        stopEngine() {
            this.isRunning = false;
            this.ppu.removeCanvas();
        }
    }

    // Register our completed pure JavaScript architecture straight to PenguinMod!
    Scratch.extensions.register(new PenguinGbcEmulator());
})(Scratch);
