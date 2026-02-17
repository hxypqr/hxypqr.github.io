document.addEventListener('DOMContentLoaded', function() {
    const postsContainer = document.getElementById('posts-container');

    if (postsContainer) {
        fetch('https://api.hxypqr.com/wp-json/wp/v2/posts')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(posts => {
                posts.forEach(post => {
                    const postElement = document.createElement('div');
                    postElement.classList.add('post');

                    const postTitle = document.createElement('h2');
                    const postLink = document.createElement('a');
                    postLink.href = `/post.html?id=${post.id}`; // Assumes a post.html for single posts
                    postLink.textContent = post.title.rendered;
                    postTitle.appendChild(postLink);

                    const postDate = document.createElement('p');
                    postDate.textContent = new Date(post.date).toLocaleDateString();

                    const postExcerpt = document.createElement('div');
                    postExcerpt.innerHTML = post.excerpt.rendered;

                    postElement.appendChild(postTitle);
                    postElement.appendChild(postDate);
                    postElement.appendChild(postExcerpt);

                    postsContainer.appendChild(postElement);
                });

                // Re-render KaTeX formulas
                if (window.renderMathInElement) {
                    renderMathInElement(postsContainer, {
                      delimiters: [
                        {left: "$$", right: "$$", display: true},
                        {left: "$", right: "$", display: false}
                      ]
                    });
                }
            })
            .catch(error => {
                console.error('There has been a problem with your fetch operation:', error);
                postsContainer.innerHTML = '<p>Error loading posts. Please try again later.</p>';
            });
    }
});


