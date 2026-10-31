from django import forms

INPUT_CLASS = (
    "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm "
    "text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 "
    "focus:border-indigo-400 focus:ring-4 focus:ring-indigo-500/10 "
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
)
SELECT_CLASS = INPUT_CLASS + " pr-9 appearance-none"
CHECK_CLASS = (
    "h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 "
    "dark:border-slate-600 dark:bg-slate-800"
)
FILE_CLASS = (
    "block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 "
    "bg-slate-50 px-3 py-2.5 text-sm text-slate-500 file:mr-3 file:rounded-lg "
    "file:border-0 file:bg-indigo-600 file:px-3 file:py-1.5 file:text-xs "
    "file:font-semibold file:text-white hover:bg-slate-100 "
    "dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
)


def style_form(form):
    """Har qanday forma maydonlariga Tailwind klasslarini qo'shadi."""
    for field in form.fields.values():
        widget = field.widget
        existing = widget.attrs.get("class", "")
        if isinstance(widget, forms.CheckboxInput):
            css = CHECK_CLASS
        elif isinstance(widget, forms.FileInput):
            css = FILE_CLASS
        elif isinstance(widget, (forms.Select, forms.SelectMultiple)):
            css = SELECT_CLASS
        elif isinstance(widget, forms.Textarea):
            css = INPUT_CLASS + " min-h-[96px] resize-y"
        else:
            css = INPUT_CLASS
        widget.attrs["class"] = f"{existing} {css}".strip()
        if field.required:
            widget.attrs.setdefault("required", "required")
    return form


class StyledFormMixin:
    """Barcha maydonlarga Tailwind klasslarini qo'shadi."""

    input_class = INPUT_CLASS
    select_class = SELECT_CLASS
    check_class = CHECK_CLASS
    file_class = FILE_CLASS

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        style_form(self)

    def style_fields(self):
        return style_form(self)


class StyledForm(StyledFormMixin, forms.Form):
    pass


class StyledModelForm(StyledFormMixin, forms.ModelForm):
    pass
