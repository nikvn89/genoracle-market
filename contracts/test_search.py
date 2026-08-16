# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

class TestSearch(gl.Contract):
    def __init__(self):
        pass

    @gl.public.view
    def test_ddg(self, query: str) -> str:
        def leader_fn() -> str:
            try:
                url = f"https://duckduckgo.com/html/?q={query.replace(' ', '+')}"
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
        
    @gl.public.view
    def test_yahoo(self, query: str) -> str:
        def leader_fn() -> str:
            try:
                url = f"https://search.yahoo.com/search?p={query.replace(' ', '+')}"
                res = gl.nondet.web.render(url, mode="text")
                return res[:1000]
            except Exception as e:
                return str(e)
        def validator_fn(res) -> bool:
            return True
        return gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
