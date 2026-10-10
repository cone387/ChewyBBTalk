"""SQLAdmin uses application identities and revalidates privileges per request."""

from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.concurrency import run_in_threadpool

from chewy_api.db.models import Attachment, BBTalk, Comment, StorageConfig, Tag, User
from chewy_api.services.security import password_user


def install_admin(app):
    class Authentication(AuthenticationBackend):
        async def login(self, request):
            form = await request.form()
            app.state.limiter.check(
                'login',
                request.client.host if request.client else 'unknown',
                app.state.settings.login_rate,
            )

            def authenticate():
                with app.state.sessions() as db:
                    user = password_user(db, form.get('username', ''), form.get('password', ''))
                    if not user or not (user.is_staff or user.is_superuser):
                        return None
                    db.commit()
                    return {'user_id': user.id, 'version': user.credential_version}

            user = await run_in_threadpool(authenticate)
            request.session.clear()
            if user:
                request.session.update(user)
            return bool(user)

        async def logout(self, request):
            request.session.clear()
            return True

        async def authenticate(self, request):
            def check():
                with app.state.sessions() as db:
                    user = (
                        db.get(User, request.session.get('user_id'))
                        if request.session.get('user_id')
                        else None
                    )
                    return bool(
                        user
                        and user.is_active
                        and (user.is_staff or user.is_superuser)
                        and user.credential_version == request.session.get('version')
                    )

            return await run_in_threadpool(check)

    admin = Admin(
        app,
        app.state.engine,
        title='ChewyBBTalk 管理',
        authentication_backend=Authentication(
            app.state.settings.secret_key,
            session_cookie='adminsession',
            same_site='strict',
            https_only=app.state.settings.cookie_secure,
        ),
    )

    class Users(ModelView, model=User):
        name_plural = '用户'
        column_list = [User.id, User.username, User.email, User.is_active, User.is_staff]
        column_searchable_list = [User.username, User.email]
        form_columns = [
            User.email,
            User.display_name,
            User.bio,
            User.is_active,
            User.is_staff,
            User.is_superuser,
        ]
        can_create = False
        can_delete = False

    admin.add_view(Users)
    # Mutations go through account-scoped APIs so visibility, receipts, encrypted
    # secrets and attachment files cannot be bypassed by generic model forms.
    for model, title in [
        (BBTalk, '记录'),
        (Tag, '标签'),
        (Comment, '评论'),
        (Attachment, '附件'),
        (StorageConfig, '存储配置'),
    ]:
        fields = [column.key for column in model.__table__.columns if 'secret' not in column.key]
        view = type(
            model.__name__ + 'Admin',
            (ModelView,),
            {
                'name_plural': title,
                'column_list': fields[:6],
                'column_details_list': fields,
                'can_view_details': True,
                'can_create': False,
                'can_edit': False,
                'can_delete': False,
                'can_export': False,
            },
            model=model,
        )
        admin.add_view(view)
    return admin
