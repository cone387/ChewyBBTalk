from pydantic import ConfigDict, Field, StrictBool, field_validator

from schemas.base import Input


class WelcomeQuote(Input):
    model_config = ConfigDict(extra='forbid')
    id: str = Field(min_length=1, max_length=64, pattern=r'^[A-Za-z0-9_-]+$')
    text: str = Field(min_length=1, max_length=1000)
    source: str = Field(default='', max_length=200)

    @field_validator('text')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('文案不能为空')
        return value.strip()

    @field_validator('source')
    @classmethod
    def trim_source(cls, value):
        return value.strip()


class WelcomeContent(Input):
    model_config = ConfigDict(extra='forbid')
    enabled: StrictBool = False
    quotes: list[WelcomeQuote] = Field(default_factory=list, max_length=200)

    @field_validator('quotes')
    @classmethod
    def unique_quotes(cls, values):
        if len({item.id for item in values}) != len(values):
            raise ValueError('文案标识不能重复')
        if len({item.text for item in values}) != len(values):
            raise ValueError('文案内容不能重复')
        return values


class WelcomeConfig(WelcomeContent):
    revision: int = Field(default=0, ge=0, strict=True)


class WelcomeSelection(Input):
    quote: WelcomeQuote | None = None
