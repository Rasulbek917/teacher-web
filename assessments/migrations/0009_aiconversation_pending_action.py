from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("assessments", "0008_aiconversation_selected_student")]

    operations = [
        migrations.AddField(
            model_name="aiconversation",
            name="pending_action",
            field=models.JSONField(blank=True, default=dict),
        ),
    ]
