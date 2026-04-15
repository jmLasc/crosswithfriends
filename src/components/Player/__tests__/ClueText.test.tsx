import {renderToStaticMarkup} from 'react-dom/server';
import ClueText from '../ClueText';

const render = (text: string) => renderToStaticMarkup(<ClueText text={text} />);

describe('ClueText', () => {
  it('renders plain text as a span', () => {
    expect(render('Plain clue')).toBe('<span>Plain clue</span>');
  });

  it('renders allowed HTML tags', () => {
    expect(render('See <i>also</i> 1A')).toBe('<span>See <i>also</i> 1A</span>');
  });

  it('strips disallowed tags but keeps their content', () => {
    expect(render('<script>alert(1)</script>boom')).toBe('<span>alert(1)boom</span>');
  });

  it('italicizes the whole clue when wrapped in double quotes', () => {
    expect(render('""quoted clue""')).toBe('<i>&quot;quoted clue&quot;</i>');
  });

  it('renders **text** as bold via Markdown', () => {
    expect(render('A **bold** move')).toBe('<span>A <strong>bold</strong> move</span>');
  });

  it('renders *text* as italic via Markdown', () => {
    expect(render('An *emphatic* clue')).toBe('<span>An <em>emphatic</em> clue</span>');
  });

  it('renders multiple Markdown spans within a single clue', () => {
    expect(render('Put all the b*o*l*d* letters in this clue t*o*gethe*r*?')).toBe(
      '<span>Put all the b<em>o</em>l<em>d</em> letters in this clue t<em>o</em>gethe<em>r</em>?</span>'
    );
  });

  it('leaves stray asterisks alone', () => {
    expect(render('5 * 6 = 30')).toBe('<span>5 * 6 = 30</span>');
  });

  it('does not apply emphasis when asterisks hug whitespace', () => {
    expect(render('* not emphasis *')).toBe('<span>* not emphasis *</span>');
  });

  it('prefers ** over * when both are present', () => {
    expect(render('**very** *neat*')).toBe('<span><strong>very</strong> <em>neat</em></span>');
  });
});
