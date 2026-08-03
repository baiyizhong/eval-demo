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


class LangfuseResourceConflictError(BusinessError):
    def __init__(self, message: str) -> None:
        super().__init__(code=2007, message=message, status_code=409)


class UnsupportedOperationError(BusinessError):
    def __init__(self, message: str) -> None:
        super().__init__(code=2003, message=message, status_code=501)


class AuthConfigError(BusinessError):
    def __init__(self) -> None:
        super().__init__(
            code=3001,
            message="GitHub OAuth 未配置",
            status_code=500,
        )


class AuthUpstreamError(BusinessError):
    def __init__(self, message: str = "GitHub 登录失败") -> None:
        super().__init__(code=3002, message=message, status_code=502)


class AuthRequiredError(BusinessError):
    def __init__(self) -> None:
        super().__init__(code=3003, message="请先登录", status_code=401)


class AuthSessionConfigError(BusinessError):
    def __init__(self) -> None:
        super().__init__(code=3004, message="认证会话密钥未配置", status_code=500)
