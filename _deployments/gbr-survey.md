---
title: "Great Barrier Reef Survey"
description: "Full mission overview"
images:
  - /assets/img/deployments/gbr1.jpg
  - /assets/img/deployments/gbr2.jpg
---

<h2>{{ page.title }}</h2>
<p>{{ page.description }}</p>

<div class="row">
{% for img in page.images %}
  <div class="col-md-4">
    <img src="{{ img }}" class="img-responsive img-rounded" />
  </div>
{% endfor %}
</div>
