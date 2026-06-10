import sys
import os

try:
    import torch
    print("CUDA Available:", torch.cuda.is_available())
    if torch.cuda.is_available():
        print("Device Name:", torch.cuda.get_device_name(0))
except Exception as e:
    print("Torch error:", e)

try:
    from kokoro import KPipeline
    print("Loading English pipeline...")
    pipeline_a = KPipeline(lang_code='a', device='cuda' if torch.cuda.is_available() else 'cpu')
    print("Loaded English.")
    
    print("Loading Japanese pipeline...")
    pipeline_j = KPipeline(lang_code='j', device='cuda' if torch.cuda.is_available() else 'cpu')
    print("Loaded Japanese.")
    
    # Test a voice
    print("Testing af_bella...")
    gen = pipeline_a("Hello world", voice="af_bella", speed=1.0)
    for gs, ps, audio in gen:
        print("af_bella success. audio len:", len(audio))
        break

    print("Testing jf_alpha...")
    gen2 = pipeline_j("こんにちは", voice="jf_alpha", speed=1.0)
    for gs, ps, audio in gen2:
        print("jf_alpha success. audio len:", len(audio))
        break

except Exception as e:
    print("Kokoro error:", e)
    import traceback
    traceback.print_exc()
