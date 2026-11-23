import { check, emmaClient } from './store.mjs';

export async function openReview(render) {
  const client = emmaClient(true);
  const gate = document.querySelector('.review-signin');
  const gallery = document.querySelector('[data-gallery]');
  const form = gate.querySelector('form');
  const submit = form.querySelector('button');
  const status = gate.querySelector('[role=status]');
  const signOut = gallery.querySelector('[data-review-signout]');

  async function showGallery() {
    if (!check(await client.rpc('is_gallery_staff'))) {
      await client.auth.signOut({ scope: 'local' });
      status.textContent = 'This account does not have review access.';
      return;
    }
    await render(client);
    gallery.hidden = false;
    gate.hidden = true;
    status.textContent = '';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    status.textContent = 'Signing in…';
    try {
      const data = new FormData(form);
      const result = await client.auth.signInWithPassword({
        email: data.get('email').trim(),
        password: data.get('password')
      });
      form.elements.password.value = '';
      if (result.error) status.textContent = 'Sign-in failed. Check your email and password.';
      else await showGallery();
    } catch {
      status.textContent = 'The review could not load. Please try again.';
    } finally {
      submit.disabled = false;
    }
  });

  signOut.addEventListener('click', async () => {
    signOut.disabled = true;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (!error) location.replace('./');
    else {
      signOut.disabled = false;
      signOut.textContent = 'Try signing out again';
    }
  });

  submit.disabled = true;
  try {
    const { session } = check(await client.auth.getSession());
    if (session) await showGallery();
  } finally {
    submit.disabled = false;
  }
}
