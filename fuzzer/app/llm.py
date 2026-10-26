import json
import logging
import os
from typing import Any, Dict, Optional

from .models import Mode
from .strategies import SYSTEM_PROMPT, build_user_instruction

logger = logging.getLogger("fuzzer-engine")


class LlmError(RuntimeError):
    pass


class LlmEngine:
    """Local GGUF model via llama-cpp-python. Falls back to mock mode when weights or the library are absent."""

    def __init__(self, model_path: Optional[str] = None) -> None:
        self.model_path = model_path or os.getenv(
            "FUZZER_MODEL_PATH", "./models/model.gguf"
        )
        self._llama: Any = None

    @property
    def mode(self) -> Mode:
        return "llm" if self._llama is not None else "mock"

    def load(self) -> None:
        if not os.path.exists(self.model_path):
            logger.warning(
                "Model weights not found at %s; running in mock simulation mode.",
                self.model_path,
            )
            return
        try:
            from llama_cpp import Llama
        except ImportError:
            logger.warning(
                "llama-cpp-python is not installed; running in mock simulation mode."
            )
            return

        logger.info("Loading local quantized model from %s ...", self.model_path)
        self._llama = Llama(
            model_path=self.model_path,
            n_ctx=int(os.getenv("N_CTX", "4096")),
            n_gpu_layers=int(os.getenv("N_GPU_LAYERS", "-1")),
            chat_format="chatml",
            verbose=False,
        )
        logger.info("Local model loaded.")

    def unload(self) -> None:
        self._llama = None

    def perturb(
        self,
        strategy: str,
        payload: Dict[str, Any],
        contract_hint: Optional[str],
        temperature: float,
    ) -> Dict[str, Any]:
        if self._llama is None:
            raise LlmError("model not loaded")
        try:
            response = self._llama.create_chat_completion(
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": build_user_instruction(
                            strategy, payload, contract_hint
                        ),
                    },
                ],
                temperature=temperature,
                response_format={"type": "json_object"},
                max_tokens=1024,
            )
            parsed = json.loads(response["choices"][0]["message"]["content"])
            mutated = parsed.get("mutated_payload")
        except (json.JSONDecodeError, KeyError, IndexError, TypeError) as err:
            raise LlmError(f"model produced an unusable response: {err}") from err

        if not isinstance(mutated, dict):
            raise LlmError("model response did not contain a mutated_payload object")
        return mutated
