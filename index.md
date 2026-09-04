---
layout: default
title: "Homepage"
description: "Notes, research thoughts, and writing on mathematics."
author_profile: true
homepage: true
social_image: "/assets/img/homepage-social-card.png"
---

<section class="home-profile" aria-labelledby="home-profile-title">
  <div class="home-profile__portrait-frame">
    <img
      class="home-profile__portrait"
      src="{{ '/assets/img/profile/hu-avatar.png' | relative_url }}"
      alt="Portrait of the site author"
      width="1025"
      height="1535"
      decoding="async"
    >
  </div>

  <div class="home-profile__content">
    <p class="home-profile__eyebrow">Personal research homepage</p>
    <h1 id="home-profile-title">Homepage</h1>
    <p class="home-profile__intro">
      Welcome to my homepage. This site features my notes, research thoughts,
      and blog posts on math-related topics.
    </p>

    <nav class="home-profile__links" aria-label="Explore this site">
      <a href="{{ '/research/' | relative_url }}">Research <span aria-hidden="true">→</span></a>
      <a href="{{ '/blog/' | relative_url }}">Blog <span aria-hidden="true">→</span></a>
    </nav>
  </div>
</section>
