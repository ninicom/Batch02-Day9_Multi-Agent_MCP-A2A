import subprocess
import time
import sys

def main():
    print("Starting all Legal Multi-Agent System services...")
    processes = []
    
    try:
        print("Starting Registry service on port 10000...")
        p1 = subprocess.Popen([sys.executable, "-m", "registry"])
        processes.append(p1)
        time.sleep(2)
        
        print("Starting Tax Agent on port 10102...")
        p2 = subprocess.Popen([sys.executable, "-m", "tax_agent"])
        processes.append(p2)
        
        print("Starting Compliance Agent on port 10103...")
        p3 = subprocess.Popen([sys.executable, "-m", "compliance_agent"])
        processes.append(p3)
        time.sleep(3)
        
        print("Starting Law Agent on port 10101...")
        p4 = subprocess.Popen([sys.executable, "-m", "law_agent"])
        processes.append(p4)
        time.sleep(3)
        
        print("Starting Customer Agent on port 10100...")
        p5 = subprocess.Popen([sys.executable, "-m", "customer_agent"])
        processes.append(p5)
        
        print("\nAll services started:")
        print("  Registry:         http://localhost:10000")
        print("  Customer Agent:   http://localhost:10100")
        print("  Law Agent:        http://localhost:10101")
        print("  Tax Agent:        http://localhost:10102")
        print("  Compliance Agent: http://localhost:10103")
        print("\nRun test_client.py to send a query:")
        print("  uv run python test_client.py")
        print("\nPress Ctrl+C to stop all services.")
        
        # Wait for all processes
        for p in processes:
            p.wait()
            
    except KeyboardInterrupt:
        print("\nStopping all services...")
    finally:
        for p in processes:
            p.terminate()
        for p in processes:
            p.wait()
        print("All services stopped.")

if __name__ == "__main__":
    main()
