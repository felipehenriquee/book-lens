from abc import ABC, abstractmethod


class StorageInterface(ABC):
    """Armazenamento de arquivos binários por chave (ex.: "scans/<id>.jpg").

    A implementação atual grava em disco local; trocar por S3/GCS em produção
    significa só escrever outra implementação desta interface.
    """

    @abstractmethod
    async def save(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    async def read(self, key: str) -> bytes | None: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...
