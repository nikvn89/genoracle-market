"""
Minimal deterministic stand-in for the GenVM `genlayer` runtime.

Scope, stated plainly: this module reproduces ONLY the deterministic surface a
GenLayer Intelligent Contract touches -- the contract base class, the
public-method decorators, `gl.message`, and `gl.vm.UserError`. It does NOT
simulate validator consensus, `gl.nondet.web.render` or `gl.nondet.exec_prompt`.
Anything that depends on the non-deterministic layer is exercised by injecting a
consensus result, never by pretending to reach one (see `set_nondet_result`).

The point of the stub is that `contracts/market.py` can be imported and executed
verbatim. No contract logic is copied here, so the suite cannot drift away from
the source it claims to test.
"""

import sys
import types


class UserError(Exception):
    """Stand-in for gl.vm.UserError -- the contract's revert signal."""


class _Message:
    def __init__(self):
        self.sender_address = "0x0000000000000000000000000000000000000000"


class _PublicNamespace:
    @staticmethod
    def write(func):
        func.__genvm_public__ = "write"
        return func

    @staticmethod
    def view(func):
        func.__genvm_public__ = "view"
        return func


class _Contract:
    """Base class for gl.Contract. State fields are plain instance attributes."""


class _VM:
    UserError = UserError

    def __init__(self):
        self._nondet_result = None

    def run_nondet_unsafe(self, leader_fn, validator_fn):
        if self._nondet_result is None:
            raise AssertionError(
                "run_nondet_unsafe was reached but no consensus result was "
                "injected. Call harness.set_nondet_result(...) first -- this "
                "suite never fabricates a validator outcome."
            )
        return self._nondet_result


class _Web:
    @staticmethod
    def render(*_args, **_kwargs):
        raise AssertionError(
            "gl.nondet.web.render must not run in the deterministic suite."
        )


class _Nondet:
    web = _Web()

    @staticmethod
    def exec_prompt(*_args, **_kwargs):
        raise AssertionError(
            "gl.nondet.exec_prompt must not run in the deterministic suite."
        )


class _GL:
    Contract = _Contract
    public = _PublicNamespace

    def __init__(self):
        self.message = _Message()
        self.vm = _VM()
        self.nondet = _Nondet()


gl = _GL()


def install():
    """Register a fake `genlayer` module so `from genlayer import *` works."""
    module = types.ModuleType("genlayer")
    module.gl = gl
    module.__all__ = ["gl"]
    sys.modules["genlayer"] = module
    return gl
