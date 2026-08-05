from genlayer import *
import json

class TestSearch(gl.Contract):
    def __init__(self):
        pass

    @gl.public.view
    def test_ddg(self, query: str) -> str:
        def leader_fn() -> str:
            try:
                url = f"https://duckduckgo.com/?q={query.replace(' ', '+')}"
                res = gl.nondet.web.render(url, mode="text")
                return res[:1000]
            except Exception as e:
                return str(e)
        def validator_fn(res) -> bool:
            return True
            
        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        
    @gl.public.view
    def test_bing(self, query: str) -> str:
        def leader_fn() -> str:
            try:
                url = f"https://www.bing.com/search?q={query.replace(' ', '+')}"
                res = gl.nondet.web.render(url, mode="text")
                return res[:1000]
            except Exception as e:
                return str(e)
        def validator_fn(res) -> bool:
            return True
            
        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
