from fastapi import HTTPException


class BusinessError(HTTPException):
    def __init__(self, code: int, message: str, status_code: int = 400) -> None:
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message


class LangfuseConfigError(BusinessError):
    def __init__(self) -> None:
        super().__init__(
            code=2001,
            message="Langfuse Admin API Key 未配置",
            status_code=500,
        )


class LangfuseUpstreamError(BusinessError):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(code=2002, message=message, status_code=status_code)


class UnsupportedOperationError(BusinessError):
    def __init__(self, message: str) -> None:
        super().__init__(code=2003, message=message, status_code=501)

