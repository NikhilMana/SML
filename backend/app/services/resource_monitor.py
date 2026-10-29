"""System resource monitor for RAM, CPU, and GPU VRAM tracking."""

import shutil
import subprocess
from typing import Dict, Any, Optional
import psutil
from app.core.config import settings
from app.core.logging import logger


class ResourceMonitor:
    """Monitors system memory, CPU load, and NVIDIA GPU VRAM without fabricating values."""

    def __init__(self):
        self._has_nvidia_smi = shutil.which("nvidia-smi") is not None

    def get_system_metrics(self) -> Dict[str, Any]:
        """Collect current system RAM and CPU utilization."""
        try:
            vm = psutil.virtual_memory()
            cpu_percent = psutil.cpu_percent(interval=None)

            return {
                "ram_total_mb": round(vm.total / (1024 * 1024), 2),
                "ram_used_mb": round(vm.used / (1024 * 1024), 2),
                "ram_available_mb": round(vm.available / (1024 * 1024), 2),
                "ram_percent": vm.percent,
                "cpu_percent": cpu_percent,
            }
        except Exception as e:
            logger.warning(f"Failed to gather system metrics: {e}")
            return {
                "ram_total_mb": None,
                "ram_used_mb": None,
                "ram_available_mb": None,
                "ram_percent": None,
                "cpu_percent": None,
            }

    def get_gpu_metrics(self) -> Dict[str, Any]:
        """Query GPU VRAM using nvidia-smi if available on Windows."""
        if not self._has_nvidia_smi:
            return {
                "gpu_available": False,
                "device_name": None,
                "vram_total_mb": None,
                "vram_used_mb": None,
                "vram_free_mb": None,
                "vram_percent": None,
                "gpu_utilization_percent": None,
                "status": "nvidia-smi not found in system PATH",
            }

        try:
            cmd = [
                "nvidia-smi",
                "--query-gpu=name,memory.total,memory.used,memory.free,utilization.gpu",
                "--format=csv,noheader,nounits",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=3)
            lines = result.stdout.strip().split("\n")
            if lines and lines[0]:
                parts = [p.strip() for p in lines[0].split(",")]
                if len(parts) >= 5:
                    name = parts[0]
                    total = float(parts[1])
                    used = float(parts[2])
                    free = float(parts[3])
                    gpu_util = float(parts[4]) if parts[4].replace(".", "", 1).isdigit() else None
                    percent = round((used / total) * 100, 1) if total > 0 else 0.0

                    return {
                        "gpu_available": True,
                        "device_name": name,
                        "vram_total_mb": total,
                        "vram_used_mb": used,
                        "vram_free_mb": free,
                        "vram_percent": percent,
                        "gpu_utilization_percent": gpu_util,
                        "status": "operational",
                    }
        except Exception as e:
            logger.debug(f"nvidia-smi query failed or timed out: {e}")

        return {
            "gpu_available": False,
            "device_name": None,
            "vram_total_mb": None,
            "vram_used_mb": None,
            "vram_free_mb": None,
            "vram_percent": None,
            "gpu_utilization_percent": None,
            "status": "GPU monitoring unavailable",
        }

    def snapshot(self) -> Dict[str, Any]:
        """Return combined snapshot of system and GPU telemetry."""
        return {
            "system": self.get_system_metrics(),
            "gpu": self.get_gpu_metrics(),
        }


resource_monitor = ResourceMonitor()
