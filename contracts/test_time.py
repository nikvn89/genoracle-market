# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

class TestTime(gl.Contract):
    def __init__(self):
        pass

    @gl.public.view
    def get_time(self) -> str:
        res = []
        try:
            res.append(f"gl.block.timestamp={getattr(gl.block, 'timestamp', 'N/A')}")
        except Exception as e:
            res.append(f"gl.block error: {e}")
            
        try:
            res.append(f"gl.message.timestamp={getattr(gl.message, 'timestamp', 'N/A')}")
        except Exception as e:
            pass

        return "|".join(res)
