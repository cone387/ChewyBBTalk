from pydantic import Field

from chewy_api.schemas.base import Input


class UserPatch(Input):
    email: str = Field(default='', max_length=254)
    display_name: str = Field(default='', max_length=150)
    avatar: str = Field(default='', max_length=200)
    bio: str = ''
